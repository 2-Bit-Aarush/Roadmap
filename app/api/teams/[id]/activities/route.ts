import { NextResponse } from 'next/server';
import { verifySession, verifyTeamPermission, verifyTeamState } from '@/lib/team-security';

/**
 * GET: Retrieves paginated team activities.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log(`[DIAGNOSTIC] activities/route GET started. Team ID: ${id}`);
    
    let userSession: any = null;
    try {
      const { user, supabase } = await verifySession(request);
      userSession = user;
      console.log(`[DIAGNOSTIC] Session verified. User ID: ${userSession.id}`);

      // 1. Verify access
      console.log(`[DIAGNOSTIC] Verifying team state for team ID: ${id}`);
      await verifyTeamState(id, 'read');
      console.log(`[DIAGNOSTIC] Team state verified successfully.`);

      console.log(`[DIAGNOSTIC] Verifying team membership for user ID: ${userSession.id}`);
      const membershipLookup = await verifyTeamPermission(userSession.id, id, 'member');
      console.log(`[DIAGNOSTIC] Team membership verified. Role: ${membershipLookup.role}, isOwner: ${membershipLookup.isOwner}`);

      // 2. Parse pagination query params
      const { searchParams } = new URL(request.url);
      const page = parseInt(searchParams.get('page') || '1', 10);
      const limit = parseInt(searchParams.get('limit') || '20', 10);
      const offset = (page - 1) * limit;

      console.log(`[DIAGNOSTIC] Fetching active members to filter activities for team ID: ${id}`);
      const { data: activeMembers } = await supabase
        .from('memberships')
        .select('user_id')
        .eq('team_id', id)
        .eq('is_active', true);

      const activeUserIds = activeMembers?.map((m: any) => m.user_id) || [];

      console.log(`[DIAGNOSTIC] Querying activities for team ID: ${id} with ${activeUserIds.length} active members`);
      // 3. Fetch activities
      let query = supabase
        .from('team_activities')
        .select('*', { count: 'exact' })
        .eq('team_id', id)
        .order('created_at', { ascending: false });

      if (activeUserIds.length > 0) {
        query = query.in('actor_id', activeUserIds);
      } else {
        // No active members, return empty results
        query = query.in('actor_id', ['00000000-0000-0000-0000-000000000000']);
      }

      const { data: activities, error, count } = await query
        .range(offset, offset + limit - 1);

      if (error) {
        console.error(`[DIAGNOSTIC] activities query failed. Error code: ${error.code}, message: ${error.message}, details: ${error.details}`);
        return NextResponse.json({ 
          success: false, 
          error: `Database error: ${error.message} (Code: ${error.code})`, 
          details: error.details 
        }, { status: 500 });
      }

      // 4. Manually join profiles to bypass PGRST200
      let activitiesWithProfiles = [];
      if (activities && activities.length > 0) {
        const actorIds = [...new Set(activities.map((a: any) => a.actor_id).filter(Boolean))];
        const profilesMap = new Map();

        if (actorIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, name, avatar_url')
            .in('id', actorIds);
          
          const { data: teamMemberships } = await supabase
            .from('memberships')
            .select('user_id, display_name')
            .eq('team_id', id)
            .in('user_id', actorIds);

          const membershipsMap = new Map();
          if (teamMemberships) {
            teamMemberships.forEach((m: any) => {
              membershipsMap.set(m.user_id, m.display_name);
            });
          }

          if (!profilesError && profiles) {
            profiles.forEach((p: any) => {
              profilesMap.set(p.id, {
                ...p,
                display_name: membershipsMap.get(p.id) || null
              });
            });
          } else if (profilesError) {
            console.error(`[DIAGNOSTIC] profiles fetch in activities failed:`, profilesError);
          }
        }

        activitiesWithProfiles = activities.map((a: any) => ({
          ...a,
          profiles: profilesMap.get(a.actor_id) || null
        }));
      }

      console.log(`[DIAGNOSTIC] activities query succeeded. Count: ${count}, Row count: ${activities?.length}`);

      return NextResponse.json({
        success: true,
        activities: activitiesWithProfiles,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      });
    } catch (authOrVerificationErr: any) {
      console.error(`[DIAGNOSTIC] Auth or verification error in activities route:`, authOrVerificationErr);
      return NextResponse.json({ 
        success: false, 
        error: authOrVerificationErr.message || 'Verification failed',
        user_id: userSession?.id,
        team_id: id 
      }, { status: authOrVerificationErr.message?.includes('Unauthorized') ? 401 : 403 });
    }
  } catch (err: any) {
    console.error('[DIAGNOSTIC] activities GET top-level crash:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

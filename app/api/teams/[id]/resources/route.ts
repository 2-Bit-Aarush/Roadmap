import { NextResponse } from 'next/server';
import { verifySession, verifyTeamPermission, verifyTeamState, checkCooldown } from '@/lib/team-security';

/**
 * GET: Lists shared resources/links in the team.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log(`[DIAGNOSTIC] resources/route GET started. Team ID: ${id}`);
    
    let userSession: any = null;
    try {
      const { user, supabase } = await verifySession(request);
      userSession = user;
      console.log(`[DIAGNOSTIC] Session verified. User ID: ${userSession.id}`);

      // Verify view permissions
      console.log(`[DIAGNOSTIC] Verifying team state for team ID: ${id}`);
      await verifyTeamState(id, 'read');
      console.log(`[DIAGNOSTIC] Team state verified successfully.`);

      console.log(`[DIAGNOSTIC] Verifying team membership for user ID: ${userSession.id}`);
      const membershipLookup = await verifyTeamPermission(userSession.id, id, 'member');
      console.log(`[DIAGNOSTIC] Team membership verified. Role: ${membershipLookup.role}, isOwner: ${membershipLookup.isOwner}`);

      console.log(`[DIAGNOSTIC] Querying resources with profiles for team ID: ${id}`);
      const { data: resources, error } = await supabase
        .from('team_resources')
        .select('*')
        .eq('team_id', id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(`[DIAGNOSTIC] resources query failed. Error code: ${error.code}, message: ${error.message}, details: ${error.details}`);
        return NextResponse.json({ 
          success: false, 
          error: `Database error: ${error.message} (Code: ${error.code})`, 
          details: error.details 
        }, { status: 500 });
      }

      // Manually join profiles to bypass PGRST200
      let resourcesWithProfiles = [];
      if (resources && resources.length > 0) {
        const creatorIds = [...new Set(resources.map((r: any) => r.created_by).filter(Boolean))];
        const profilesMap = new Map();

        if (creatorIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, name, avatar_url')
            .in('id', creatorIds);

          const { data: teamMemberships } = await supabase
            .from('memberships')
            .select('user_id, display_name')
            .eq('team_id', id)
            .in('user_id', creatorIds);

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
            console.error(`[DIAGNOSTIC] profiles fetch in resources failed:`, profilesError);
          }
        }

        resourcesWithProfiles = resources.map((r: any) => ({
          ...r,
          profiles: profilesMap.get(r.created_by) || null
        }));
      }

      console.log(`[DIAGNOSTIC] resources query succeeded. Count: ${resources?.length}`);

      return NextResponse.json({ success: true, resources: resourcesWithProfiles });
    } catch (authOrVerificationErr: any) {
      console.error(`[DIAGNOSTIC] Auth or verification error in resources route:`, authOrVerificationErr);
      return NextResponse.json({ 
        success: false, 
        error: authOrVerificationErr.message || 'Verification failed',
        user_id: userSession?.id,
        team_id: id 
      }, { status: authOrVerificationErr.message?.includes('Unauthorized') ? 401 : 403 });
    }
  } catch (err: any) {
    console.error('[DIAGNOSTIC] resources GET top-level crash:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST: Shares a new resource/link (Mentors and Admins only).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase } = await verifySession(request);
    const body = await request.json();

    const { title, url, description } = body;
    if (!title || !url) {
      return NextResponse.json({ error: 'Title and URL are required fields' }, { status: 400 });
    }

    // 1. Verify team states and permissions (min role: mentor)
    await verifyTeamState(id, 'membership_change');
    await verifyTeamPermission(user.id, id, 'mentor');

    // 2. Cooldown check (max 1 resource per 10 seconds)
    await checkCooldown(user.id, 'resource_spam', 10, 1);

    // 3. Create resource
    const { data: resource, error } = await supabase
      .from('team_resources')
      .insert({
        team_id: id,
        title,
        url,
        description: description || '',
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // 4. Log activity
    await supabase
      .from('team_activities')
      .insert({
        team_id: id,
        actor_id: user.id,
        activity_type: 'resource_added',
        metadata: { title, url },
      });

    return NextResponse.json({ success: true, resource });
  } catch (err: any) {
    console.error('Resources POST error:', err);
    const status = err.message?.includes('Unauthorized') ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}

import { NextResponse } from 'next/server';
import { verifySession, verifyTeamPermission, verifyTeamState } from '@/lib/team-security';

/**
 * GET: Calculates team analytics, completion rates, streaks, and participation metrics.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log(`[DIAGNOSTIC] analytics/route GET started. Team ID: ${id}`);
    
    let userSession: any = null;
    try {
      const { user, supabase } = await verifySession(request);
      userSession = user;
      console.log(`[DIAGNOSTIC] Session verified. User ID: ${userSession.id}`);

      // Verify access
      console.log(`[DIAGNOSTIC] Verifying team state for team ID: ${id}`);
      await verifyTeamState(id, 'read');
      console.log(`[DIAGNOSTIC] Team state verified successfully.`);

      console.log(`[DIAGNOSTIC] Verifying team membership for user ID: ${userSession.id}`);
      const membershipLookup = await verifyTeamPermission(userSession.id, id, 'member');
      console.log(`[DIAGNOSTIC] Team membership verified. Role: ${membershipLookup.role}, isOwner: ${membershipLookup.isOwner}`);

      // Fetch team settings
      console.log(`[DIAGNOSTIC] Fetching settings for team ID: ${id}`);
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .select('settings, owner_id')
        .eq('id', id)
        .single();

      if (teamError) {
        console.error(`[DIAGNOSTIC] Fetching team settings failed. Error code: ${teamError.code}, message: ${teamError.message}`);
        return NextResponse.json({ 
          success: false, 
          error: `Database error (fetching settings): ${teamError.message} (Code: ${teamError.code})`, 
          details: teamError.details 
        }, { status: 500 });
      }

      const settings = team?.settings as any;
      const privacy = settings?.privacy || {};
      const leaderboardVisibility = privacy.leaderboard_visibility || 'exact';

      console.log(`[DIAGNOSTIC] Fetching memberships with profiles for team ID: ${id}`);
      // 1. Fetch active memberships with profile info
      const { data: members, error: memError } = await supabase
        .from('memberships')
        .select(`
          user_id,
          role,
          joined_at,
          current_streak,
          longest_streak,
          last_active_at,
          display_name,
          profiles (
            name,
            email
          )
        `)
        .eq('team_id', id)
        .eq('is_active', true);

      if (memError) {
        console.error(`[DIAGNOSTIC] memberships select in analytics failed. Error code: ${memError.code}, message: ${memError.message}, details: ${memError.details}`);
        return NextResponse.json({ 
          success: false, 
          error: `Database error (fetching memberships): ${memError.message} (Code: ${memError.code})`, 
          details: memError.details 
        }, { status: 500 });
      }

      console.log(`[DIAGNOSTIC] memberships query in analytics succeeded. Count: ${members?.length}`);

      // 2. Fetch all completed nodes for users in this team to calculate averages
      const memberIds = members.map((m) => m.user_id);
      let progressRecords: any[] = [];
      
      if (memberIds.length > 0) {
        console.log(`[DIAGNOSTIC] Fetching progress records for ${memberIds.length} members.`);
        const { data: progress, error: progError } = await supabase
          .from('progress_tracking')
          .select(`
            user_id,
            completed,
            node_id,
            completed_at
          `)
          .in('user_id', memberIds)
          .eq('completed', true);

        if (progError) {
          console.error(`[DIAGNOSTIC] progress query in analytics failed. Error code: ${progError.code}, message: ${progError.message}`);
          return NextResponse.json({ 
            success: false, 
            error: `Database error (fetching progress): ${progError.message} (Code: ${progError.code})`, 
            details: progError.details 
          }, { status: 500 });
        }
        progressRecords = progress || [];
        console.log(`[DIAGNOSTIC] progress query succeeded. Records: ${progressRecords.length}`);
      }

      // 3. Compute completion rate and active metrics per user
      const memberAnalytics = members.map((m, idx) => {
        const userProgress = progressRecords.filter((p) => p.user_id === m.user_id);
        
        let name = m.display_name || m.profiles?.name || 'Unknown User';
        let email = m.profiles?.email || '';

        const isElevated = ['mentor', 'team_admin', 'website_admin', 'admin'].includes(m.role) || m.user_id === team?.owner_id;

        if (leaderboardVisibility === 'anonymous' && !isElevated) {
          name = `Member ${String.fromCharCode(65 + (idx % 26))}`;
          email = '';
        }

        return {
          user_id: m.user_id,
          name,
          email,
          role: m.role,
          completedCount: userProgress.length,
          currentStreak: m.current_streak,
          longestStreak: m.longest_streak,
          lastActive: m.last_active_at,
        };
      });

      // Sort leaderboard by completed nodes count
      if (leaderboardVisibility !== 'disabled') {
        memberAnalytics.sort((a, b) => b.completedCount - a.completedCount);
      }

      // 4. Calculate participation (last 7 days active count)
      const activeCount = members.filter((m) => {
        const diff = new Date().getTime() - new Date(m.last_active_at).getTime();
        return diff <= 1000 * 60 * 60 * 24 * 7; // active in last 7 days
      }).length;

      const inactiveCount = members.length - activeCount;

      console.log(`[DIAGNOSTIC] Analytics calculation completed successfully.`);

      return NextResponse.json({
        success: true,
        leaderboard: leaderboardVisibility === 'disabled' ? [] : memberAnalytics,
        stats: {
          totalMembers: members.length,
          activeMembers: activeCount,
          inactiveMembers: inactiveCount,
          participationRate: members.length > 0 ? Math.round((activeCount / members.length) * 100) : 0,
        },
      });
    } catch (authOrVerificationErr: any) {
      console.error(`[DIAGNOSTIC] Auth or verification error in analytics route:`, authOrVerificationErr);
      return NextResponse.json({ 
        success: false, 
        error: authOrVerificationErr.message || 'Verification failed',
        user_id: userSession?.id,
        team_id: id 
      }, { status: authOrVerificationErr.message?.includes('Unauthorized') ? 401 : 403 });
    }
  } catch (err: any) {
    console.error('[DIAGNOSTIC] analytics GET top-level crash:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

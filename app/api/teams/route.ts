import { NextResponse } from 'next/server';
import { verifySession, isWebsiteAdmin } from '@/lib/team-security';

/**
 * GET: Retrieves the teams the active user is a member of.
 * Query strategy: Membership first, then teams (never query all teams).
 * Supports search, filters, pagination, and sorting.
 */
export async function GET(request: Request) {
  try {
    const { user, supabase } = await verifySession(request);

    // Parse query params
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') || '';
    const status = searchParams.get('status') || '';
    const favorites = searchParams.get('favorites') === 'true';
    const pinned = searchParams.get('pinned') === 'true';
    const sortBy = searchParams.get('sortBy') || 'pinned_favorite_joined';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;

    // 1. Fetch memberships first (membership-first query strategy)
    let memQuery = supabase
      .from('memberships')
      .select('team_id, role, is_pinned, is_favorite, joined_at, last_active_at')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (role) {
      memQuery = memQuery.eq('role', role);
    }
    if (pinned) {
      memQuery = memQuery.eq('is_pinned', true);
    }
    if (favorites) {
      memQuery = memQuery.eq('is_favorite', true);
    }

    const { data: memberships, error: memError } = await memQuery;
    if (memError) throw memError;

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ success: true, teams: [], total: 0 });
    }

    const teamIds = memberships.map((m) => m.team_id);

    // 2. Fetch team details for resolved IDs
    let teamQuery = supabase
      .from('teams')
      .select('id, name, description, icon, goal, status, owner_id, visibility, settings, member_limit', { count: 'exact' })
      .in('id', teamIds);

    if (status) {
      teamQuery = teamQuery.eq('status', status);
    } else {
      teamQuery = teamQuery.neq('status', 'deleted');
    }

    if (search) {
      teamQuery = teamQuery.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Apply pagination range limits
    teamQuery = teamQuery.range(offset, offset + limit - 1);

    const { data: teams, count: totalCount, error: teamError } = await teamQuery;
    if (teamError) throw teamError;

    if (!teams || teams.length === 0) {
      return NextResponse.json({ success: true, teams: [], total: 0 });
    }

    const resolvedIds = teams.map((t) => t.id);

    // 3. Fetch metrics cache for these teams
    const { data: metrics } = await supabase
      .from('team_metrics_cache')
      .select('*')
      .in('team_id', resolvedIds);

    // 4. Fetch last activities for snippet preview (last 3 items)
    const { data: activities } = await supabase
      .from('team_activities')
      .select('team_id, activity_type, created_at, actor_id, metadata')
      .in('team_id', resolvedIds)
      .order('created_at', { ascending: false });

    // Combine teams, memberships, cache, and snippets
    const enrichedTeams = teams.map((team) => {
      const membership = memberships.find((m) => m.team_id === team.id);
      const metric = metrics?.find((m) => m.team_id === team.id);
      const teamActs = activities?.filter((a) => a.team_id === team.id).slice(0, 3) || [];

      return {
        ...team,
        role: membership?.role || 'member',
        is_pinned: membership?.is_pinned || false,
        is_favorite: membership?.is_favorite || false,
        joined_at: membership?.joined_at,
        last_active_at: membership?.last_active_at,
        metrics: {
          completion_rate: metric?.completion_rate || 0,
          active_members: metric?.active_members || 1,
          weekly_activity: metric?.weekly_activity || 0,
        },
        snippets: teamActs.map((act) => ({
          type: act.activity_type,
          created_at: act.created_at,
          metadata: act.metadata,
        })),
      };
    });

    // 5. Apply sorting logic in memory
    enrichedTeams.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'recent_activity') {
        const aTime = a.snippets?.[0] ? new Date(a.snippets[0].created_at).getTime() : 0;
        const bTime = b.snippets?.[0] ? new Date(b.snippets[0].created_at).getTime() : 0;
        return bTime - aTime;
      }
      if (sortBy === 'joined_at') {
        return new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime();
      }
      
      // Default: pinned first, then favorite, then joined_at
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
      return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
    });

    return NextResponse.json({
      success: true,
      teams: enrichedTeams,
      total: totalCount || 0,
      page,
      limit
    });
  } catch (err: any) {
    console.error('Teams GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST: Creates a new team (transaction safety ensured: triggers create initial membership).
 */
export async function POST(request: Request) {
  try {
    const { user, supabase } = await verifySession(request);

    // Only website administrators can create collaborative teams
    const isWebAdmin = await isWebsiteAdmin(user.id);
    if (!isWebAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Only website administrators are authorized to create collaborative teams.' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const { name, description, icon, goal, visibility, memberLimit } = body;
    if (!name) {
      return NextResponse.json({ error: 'Team name is required' }, { status: 400 });
    }

    // Insert team (triggers handle_team_creation to initialize creator membership as team_admin)
    const { data: team, error } = await supabase
      .from('teams')
      .insert({
        name,
        description: description || '',
        icon: icon || 'Shield',
        goal: goal || '',
        visibility: visibility || 'public',
        owner_id: user.id,
        created_by: user.id,
        member_limit: memberLimit ? parseInt(memberLimit, 10) : null
      })
      .select()
      .single();

    if (error) throw error;

    // Log create activity manually to trigger cache and feed updates
    await supabase
      .from('team_activities')
      .insert({
        team_id: team.id,
        actor_id: user.id,
        activity_type: 'joined_team',
        metadata: { member_id: user.id, reason: 'creator' },
      });

    return NextResponse.json({ success: true, team });
  } catch (err: any) {
    console.error('Teams POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}


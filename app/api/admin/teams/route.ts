import { NextResponse } from 'next/server';
import { verifySession, isWebsiteAdmin } from '@/lib/team-security';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(request: Request) {
  try {
    // 1. Rate limit check (60 requests per minute)
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    if (!rateLimit(ip, 60, 60 * 1000)) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    // 2. Resolve session user
    const { user, supabase } = await verifySession(request);

    // 3. Verify role in admin_roles
    const isAdmin = await isWebsiteAdmin(user.id);
    console.log(`[DIAGNOSTIC] GET /api/admin/teams: User ID: ${user.id}, isWebsiteAdmin: ${isAdmin}`);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 4. Fetch all teams
    console.log(`[DIAGNOSTIC] GET /api/admin/teams: Fetching all teams from database`);
    const { data: teams, error } = await supabase
      .from('teams')
      .select(`
        id,
        name,
        description,
        icon,
        goal,
        status,
        status_reason,
        created_at,
        owner_id,
        visibility,
        settings,
        member_limit,
        memberships(
          role,
          is_active,
          user_id,
          display_name,
          profiles(id, name, email)
        ),
        invites(
          id,
          code,
          is_revoked,
          expires_at
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DIAGNOSTIC] GET /api/admin/teams: Database query failed:', error);
      throw error;
    }

    // Stitch owner profiles in-memory
    let enrichedTeams: any[] = [];
    if (teams && teams.length > 0) {
      const ownerIds = Array.from(new Set(teams.map((t: any) => t.owner_id).filter(Boolean)));
      if (ownerIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', ownerIds);
        
        if (profilesError) {
          console.error('[DIAGNOSTIC] GET /api/admin/teams: Failed to fetch owner profiles:', profilesError);
        }
        
        const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
        enrichedTeams = teams.map((team: any) => ({
          ...team,
          owner: profileMap.get(team.owner_id) || null
        }));
      } else {
        enrichedTeams = teams.map((team: any) => ({
          ...team,
          owner: null
        }));
      }
    }

    console.log(`[DIAGNOSTIC] GET /api/admin/teams: Successfully retrieved ${enrichedTeams.length} teams.`);
    return NextResponse.json({ success: true, teams: enrichedTeams });
  } catch (err: any) {
    console.error('Admin teams GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { verifySession, verifyTeamPermission, verifyTeamState } from '@/lib/team-security';

/**
 * GET: Retrieves a team's full detail profile (Overview tab).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase } = await verifySession(request);

    // Verify view permissions
    await verifyTeamState(id, 'read');
    const { role, isOwner } = await verifyTeamPermission(user.id, id, 'member');

    // Update last_active_at for the current user (team page open active indicator)
    await supabase
      .from('memberships')
      .update({ last_active_at: new Date().toISOString() })
      .eq('team_id', id)
      .eq('user_id', user.id);

    // Fetch team
    const { data: team, error } = await supabase
      .from('teams')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    // Fetch metrics cache
    const { data: cache } = await supabase
      .from('team_metrics_cache')
      .select('*')
      .eq('team_id', id)
      .single();

    // Fetch members count
    const { count: memberCount } = await supabase
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', id)
      .eq('is_active', true);

    return NextResponse.json({
      success: true,
      team: {
        ...team,
        role,
        isOwner,
        memberCount: memberCount || 0,
        metrics: cache || { completion_rate: 0, active_members: 1, weekly_activity: 0 },
      },
    });
  } catch (err: any) {
    console.error('Team GET error:', err);
    const status = err.message?.includes('Unauthorized') ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}

/**
 * PUT: Updates team details, settings, or soft deletes/archives the team.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase } = await verifySession(request);
    const body = await request.json();

    // Check if it's a restore attempt
    const { data: currentTeam } = await supabase
      .from('teams')
      .select('status, owner_id')
      .eq('id', id)
      .single();

    const isRestoreAttempt = currentTeam?.status === 'deleted' && body.status === 'active';

    if (isRestoreAttempt) {
      // 1. Restore requires owner or website admin (strictly block normal team admins)
      const { role: requestorRole } = await verifyTeamPermission(user.id, id, 'team_admin');
      const isOwner = currentTeam?.owner_id === user.id;
      if (requestorRole !== 'website_admin' && !isOwner) {
        return NextResponse.json({ error: 'Forbidden: Only the owner or website admins can restore a deleted team' }, { status: 403 });
      }
      // Bypasses verifyTeamState
    } else {
      // 2. Normal settings updates require active/restricted states
      await verifyTeamState(id, 'edit_settings');
      await verifyTeamPermission(user.id, id, 'team_admin');
    }

    const { name, description, icon, goal, visibility, settings, status, status_reason, memberLimit } = body;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (icon !== undefined) updates.icon = icon;
    if (goal !== undefined) updates.goal = goal;
    if (visibility !== undefined) updates.visibility = visibility;
    if (settings !== undefined) updates.settings = settings;
    if (memberLimit !== undefined) updates.member_limit = memberLimit ? parseInt(memberLimit, 10) : null;

    // Enforce status check restrictions
    if (status !== undefined) {
      if (status === 'deleted') {
        // Soft delete requires deleted_at and deleted_by
        updates.status = 'deleted';
        updates.deleted_at = new Date().toISOString();
        updates.deleted_by = user.id;
      } else if (isRestoreAttempt) {
        updates.status = 'active';
        updates.deleted_at = null;
        updates.deleted_by = null;
      } else {
        const { role: requestorRole } = await verifyTeamPermission(user.id, id, 'team_admin');
        // Archiving or restricting
        if (requestorRole !== 'website_admin' && status === 'banned') {
          return NextResponse.json({ error: 'Forbidden: Only global admins can ban teams.' }, { status: 403 });
        }
        updates.status = status;
        updates.status_reason = status_reason || '';
      }
    }

    updates.updated_at = new Date().toISOString();

    const { data: updatedTeam, error } = await supabase
      .from('teams')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Log update audit
    await supabase
      .from('team_activities')
      .insert({
        team_id: id,
        actor_id: user.id,
        activity_type: 'agenda_updated', // Fallback for settings update log
        metadata: { field: Object.keys(updates).join(', ') },
      });

    return NextResponse.json({ success: true, team: updatedTeam });
  } catch (err: any) {
    console.error('Team PUT error:', err);
    const status = err.message?.includes('Unauthorized') ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}

/**
 * DELETE: Disbands/hard deletes a team (website admin or owner only).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase } = await verifySession(request);

    const { role, isOwner } = await verifyTeamPermission(user.id, id, 'team_admin');
    if (role !== 'website_admin' && !isOwner) {
      return NextResponse.json({ error: 'Forbidden: Only the owner or global admins can disband the team.' }, { status: 403 });
    }

    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Team disbanded successfully' });
  } catch (err: any) {
    console.error('Team DELETE error:', err);
    const status = err.message?.includes('Unauthorized') ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}

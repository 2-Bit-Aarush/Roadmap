import { NextResponse } from 'next/server';
import { verifySession, verifyTeamPermission, verifyTeamState } from '@/lib/team-security';

/**
 * PUT: Updates a member's role (Team Admin or Website Admin only).
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { id, userId } = await params;
    const { user, supabase } = await verifySession(request);
    const body = await request.json();

    const { role: newRole } = body;
    if (!newRole) {
      return NextResponse.json({ error: 'New role is required' }, { status: 400 });
    }

    // 1. Verify team states and admin permissions
    await verifyTeamState(id, 'membership_change');
    const { role: requestorRole } = await verifyTeamPermission(user.id, id, 'team_admin');

    // 2. Load target's current membership to check hierarchy
    const { data: targetMembership, error: memError } = await supabase
      .from('memberships')
      .select('role')
      .eq('team_id', id)
      .eq('user_id', userId)
      .single();

    if (memError || !targetMembership) {
      return NextResponse.json({ error: 'Membership record not found' }, { status: 404 });
    }

    // 3. Trigger check (also checked at database level, but validated here for early failure returns)
    if (requestorRole !== 'website_admin') {
      if (targetMembership.role === 'team_admin' || newRole === 'team_admin') {
        // Normal team admin cannot demote other team admins or promote members to team admin
        // (Website Admin or Owner only).
        const { data: team } = await supabase.from('teams').select('owner_id').eq('id', id).single();
        if (team?.owner_id !== user.id) {
          return NextResponse.json({ error: 'Forbidden: Only the team owner or global admins can modify team admin roles' }, { status: 403 });
        }
      }
    }

    // 4. Update role (triggers database constraint triggers)
    const { error: updateError } = await supabase
      .from('memberships')
      .update({ role: newRole })
      .eq('team_id', id)
      .eq('user_id', userId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, message: 'Member role updated successfully' });
  } catch (err: any) {
    console.error('Member PUT error:', err);
    const status = err.message?.includes('Unauthorized') ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}

/**
 * DELETE: Kicks a member or leaves the team (soft delete).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { id, userId } = await params;
    const { user, supabase } = await verifySession(request);

    // 1. Verify team states
    await verifyTeamState(id, 'membership_change');

    // 2. Validate leave or kick permission
    const isSelf = user.id === userId;
    if (!isSelf) {
      // It's a kick: requires team_admin or website_admin
      await verifyTeamPermission(user.id, id, 'team_admin');
    }

    // 3. Fetch team details for owner safeguard
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Safeguard: Prevent removing team owner
    if (team.owner_id === userId) {
      return NextResponse.json(
        { error: 'Team owner cannot be removed. Transfer ownership or delete the team.' },
        { status: 400 }
      );
    }

    // 4. Fetch target member details to check role
    const { data: targetMember, error: memError } = await supabase
      .from('memberships')
      .select('role, is_active')
      .eq('team_id', id)
      .eq('user_id', userId)
      .single();

    if (memError || !targetMember) {
      return NextResponse.json({ error: 'Membership record not found' }, { status: 404 });
    }

    if (!targetMember.is_active) {
      return NextResponse.json({ error: 'Member is already inactive' }, { status: 400 });
    }

    // Safeguard: Prevent removing the last admin
    if (targetMember.role === 'team_admin') {
      const { count: adminCount, error: countError } = await supabase
        .from('memberships')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', id)
        .eq('role', 'team_admin')
        .eq('is_active', true);

      if (countError) throw countError;

      if (adminCount !== null && adminCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot remove the final team administrator.' },
          { status: 400 }
        );
      }
    }

    // 5. Perform soft delete: update is_active to false
    const { error: updateError } = await supabase
      .from('memberships')
      .update({ is_active: false })
      .eq('team_id', id)
      .eq('user_id', userId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: isSelf ? 'Left the team successfully' : 'Member removed successfully',
    });
  } catch (err: any) {
    console.error('Member DELETE error:', err);
    const status = err.message?.includes('Unauthorized') ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}

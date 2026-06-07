import { NextResponse } from 'next/server';
import { verifySession, verifyTeamPermission, verifyTeamState } from '@/lib/team-security';

/**
 * POST: Transfers ownership of a team to another active member.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase } = await verifySession(request);
    const body = await request.json();

    const { newOwnerId } = body;
    if (!newOwnerId) {
      return NextResponse.json({ error: 'New owner user ID is required' }, { status: 400 });
    }

    // 1. Verify team states and current user permissions
    await verifyTeamState(id, 'edit_settings');
    const { role, isOwner } = await verifyTeamPermission(user.id, id, 'team_admin');

    if (role !== 'website_admin' && !isOwner) {
      return NextResponse.json({ error: 'Forbidden: Only the owner or global admins can transfer ownership' }, { status: 403 });
    }

    // 2. Validate that the target newOwnerId is actually a member of the team
    const { data: memberCheck } = await supabase
      .from('memberships')
      .select('role')
      .eq('team_id', id)
      .eq('user_id', newOwnerId)
      .eq('is_active', true)
      .single();

    if (!memberCheck) {
      return NextResponse.json({ error: 'Bad Request: Target user is not an active member of this team' }, { status: 400 });
    }

    // 3. Update team owner_id (triggers database trigger logic)
    const { error: teamError } = await supabase
      .from('teams')
      .update({ owner_id: newOwnerId, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (teamError) throw teamError;

    // 4. Force ensure new owner is a team_admin
    if (memberCheck.role !== 'team_admin') {
      const { error: roleError } = await supabase
        .from('memberships')
        .update({ role: 'team_admin' })
        .eq('team_id', id)
        .eq('user_id', newOwnerId);

      if (roleError) throw roleError;
    }

    // 5. Log activity to activities and audit_logs
    await supabase
      .from('team_activities')
      .insert({
        team_id: id,
        actor_id: user.id,
        activity_type: 'ownership_transferred',
        metadata: { old_owner: user.id, new_owner: newOwnerId },
      });

    return NextResponse.json({ success: true, message: 'Ownership transferred successfully' });
  } catch (err: any) {
    console.error('Owner POST error:', err);
    const status = err.message?.includes('Unauthorized') ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}

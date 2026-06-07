import { NextResponse } from 'next/server';
import { verifySession, verifyTeamPermission, verifyTeamState } from '@/lib/team-security';

/**
 * DELETE: Deletes an agenda, milestone, or challenge item.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const { user, supabase } = await verifySession(request);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'agenda';

    // 1. Verify team states and admin permissions
    await verifyTeamState(id, 'membership_change');
    await verifyTeamPermission(user.id, id, 'team_admin');

    // 2. Perform deletion based on type
    let error;
    if (type === 'agenda') {
      const { error: deleteError } = await supabase
        .from('team_agendas')
        .delete()
        .eq('id', itemId)
        .eq('team_id', id);
      error = deleteError;
    } else if (type === 'milestone') {
      const { error: deleteError } = await supabase
        .from('team_milestones')
        .delete()
        .eq('id', itemId)
        .eq('team_id', id);
      error = deleteError;
    } else if (type === 'challenge' || type === 'weekly_goal') {
      const { error: deleteError } = await supabase
        .from('team_challenges')
        .delete()
        .eq('id', itemId)
        .eq('team_id', id);
      error = deleteError;
    } else {
      return NextResponse.json({ error: 'Invalid item type' }, { status: 400 });
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // 3. Log activity
    await supabase
      .from('team_activities')
      .insert({
        team_id: id,
        actor_id: user.id,
        activity_type: 'agenda_updated', // Fallback status log for item removal
        metadata: { item_id: itemId, item_type: type, action: 'deleted' },
      });

    return NextResponse.json({ success: true, message: 'Item deleted successfully' });
  } catch (err: any) {
    console.error('Milestones item DELETE error:', err);
    const status = err.message?.includes('Unauthorized') ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}

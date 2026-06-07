import { NextResponse } from 'next/server';
import { verifySession, verifyTeamPermission, verifyTeamState } from '@/lib/team-security';

/**
 * GET: Lists team goals, milestones, and challenges.
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
    await verifyTeamPermission(user.id, id, 'member');

    // Fetch weekly goals and challenges
    const { data: challenges, error: chalError } = await supabase
      .from('team_challenges')
      .select('*')
      .eq('team_id', id)
      .order('created_at', { ascending: false });

    if (chalError) throw chalError;

    // Fetch milestones
    const { data: milestones, error: mileError } = await supabase
      .from('team_milestones')
      .select('*')
      .eq('team_id', id);

    if (mileError) throw mileError;

    // Fetch agendas
    const { data: agendas, error: agendaError } = await supabase
      .from('team_agendas')
      .select('*')
      .eq('team_id', id)
      .order('start_date', { ascending: true });

    if (agendaError) throw agendaError;

    return NextResponse.json({
      success: true,
      challenges: challenges || [],
      milestones: milestones || [],
      agendas: agendas || [],
    });
  } catch (err: any) {
    console.error('Milestones GET error:', err);
    const status = err.message?.includes('Unauthorized') ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}

/**
 * POST: Creates a milestone, challenge, weekly goal, or agenda item (Admins only).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase } = await verifySession(request);
    const body = await request.json();

    const { type, title, description, targetDate, startDate, endDate, completionRequirement, reward } = body;
    if (!title || !type) {
      return NextResponse.json({ error: 'Title and type are required' }, { status: 400 });
    }

    // 1. Verify permissions
    await verifyTeamState(id, 'membership_change');
    await verifyTeamPermission(user.id, id, 'team_admin');

    if (type === 'agenda') {
      if (!startDate || !endDate) {
        return NextResponse.json({ error: 'startDate and endDate are required for agenda items' }, { status: 400 });
      }

      const { data: agenda, error } = await supabase
        .from('team_agendas')
        .insert({
          team_id: id,
          title,
          description: description || '',
          start_date: startDate,
          end_date: endDate,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase
        .from('team_activities')
        .insert({
          team_id: id,
          actor_id: user.id,
          activity_type: 'agenda_updated',
          metadata: { title },
        });

      return NextResponse.json({ success: true, item: agenda });
    } else if (type === 'milestone') {
      const { data: milestone, error } = await supabase
        .from('team_milestones')
        .insert({
          team_id: id,
          title,
          completion_requirement: completionRequirement || {},
          reward: reward || '',
        })
        .select()
        .single();

      if (error) throw error;

      await supabase
        .from('team_activities')
        .insert({
          team_id: id,
          actor_id: user.id,
          activity_type: 'milestone_unlocked',
          metadata: { title },
        });

      return NextResponse.json({ success: true, item: milestone });
    } else if (type === 'challenge' || type === 'weekly_goal') {
      const { data: challenge, error } = await supabase
        .from('team_challenges')
        .insert({
          team_id: id,
          title,
          description: description || '',
          start_date: startDate || new Date().toISOString(),
          end_date: targetDate || endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          created_by: user.id,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;

      await supabase
        .from('team_activities')
        .insert({
          team_id: id,
          actor_id: user.id,
          activity_type: type === 'weekly_goal' ? 'goal_completed' : 'challenge_completed', // placeholder status logging
          metadata: { title },
        });

      return NextResponse.json({ success: true, item: challenge });
    } else {
      return NextResponse.json({ error: 'Invalid item type. Allowed values: agenda, milestone, challenge, weekly_goal' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('Milestones POST error:', err);
    const status = err.message?.includes('Unauthorized') ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}

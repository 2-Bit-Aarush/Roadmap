import { NextResponse } from 'next/server';
import { verifySession, verifyTeamPermission } from '@/lib/team-security';

/**
 * GET: Lists previous export jobs for the team requested by the current user.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase } = await verifySession(request);

    // Verify view permissions
    await verifyTeamPermission(user.id, id, 'team_admin');

    const { data: jobs, error } = await supabase
      .from('export_jobs')
      .select('*')
      .eq('team_id', id)
      .eq('requested_by', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, jobs });
  } catch (err: any) {
    console.error('Export jobs GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

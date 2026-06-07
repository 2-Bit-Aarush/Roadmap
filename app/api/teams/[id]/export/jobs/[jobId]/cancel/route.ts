import { NextResponse } from 'next/server';
import { verifySession, verifyTeamPermission } from '@/lib/team-security';

/**
 * POST: Cancels a pending/running export job.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const { id, jobId } = await params;
    const { user, supabase } = await verifySession(request);

    // Verify admin access
    await verifyTeamPermission(user.id, id, 'team_admin');

    const { data: job, error } = await supabase
      .from('export_jobs')
      .select('status')
      .eq('id', jobId)
      .eq('team_id', id)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: 'Export job not found' }, { status: 404 });
    }

    if (job.status !== 'queued' && job.status !== 'processing') {
      return NextResponse.json({ error: 'Export job is not in a cancellable state' }, { status: 400 });
    }

    // Set status to cancelled to cancel the background worker execution
    const { error: updateError } = await supabase
      .from('export_jobs')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, message: 'Export job cancellation requested' });
  } catch (err: any) {
    console.error('Cancel POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

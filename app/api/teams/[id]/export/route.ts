import { NextResponse, waitUntil } from 'next/server';
import { verifySession, verifyTeamPermission, verifyTeamState, checkCooldown } from '@/lib/team-security';

/**
 * POST: Initiates a new server-side team progress export.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase } = await verifySession(request);
    const body = await request.json();

    const format = body.format || 'xlsx';
    if (!['xlsx', 'csv'].includes(format)) {
      return NextResponse.json({ error: 'Invalid format. Allowed: xlsx, csv' }, { status: 400 });
    }

    // 1. Verify team states and permissions (min role: team_admin)
    await verifyTeamState(id, 'read');
    await verifyTeamPermission(user.id, id, 'team_admin');

    // 2. Cooldown check (1 export job per 30 seconds)
    await checkCooldown(user.id, 'export_spam', 30, 1);

    // 3. Create job in public.export_jobs (triggers queued state)
    const { data: job, error } = await supabase
      .from('export_jobs')
      .insert({
        team_id: id,
        requested_by: user.id,
        status: 'queued',
        format,
      })
      .select()
      .single();

    if (error) throw error;

    // 3.5 Trigger cron queue processing worker route immediately using fetch within waitUntil to guarantee execution
    const baseUrl = new URL(request.url).origin;
    const cronSecret = process.env.CRON_SECRET || 'local-cron-fallback-key';
    
    const triggerPromise = fetch(`${baseUrl}/api/cron`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json'
      }
    }).then(async (res) => {
      if (!res.ok) {
        throw new Error(`Worker route returned status ${res.status}: ${await res.text()}`);
      }
    });

    waitUntil(triggerPromise.catch((err) => {
      console.error('[EXPORT] Failed to trigger background cron processor:', err);
    }));

    // 4. Log audit log
    await supabase
      .from('team_activities')
      .insert({
        team_id: id,
        actor_id: user.id,
        activity_type: 'export_created',
        metadata: { format, job_id: job.id },
      });

    return NextResponse.json({ success: true, job });
  } catch (err: any) {
    console.error('Export POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

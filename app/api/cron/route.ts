import { NextResponse } from 'next/server';
import { createClientServer } from '@/lib/supabase-server';
import { processExportQueue } from '@/lib/export-processor';

/**
 * POST /api/cron: Scheduled background processor.
 * Runs daily or on schedule to perform export queue checks and activity retention cleanup.
 */
export async function POST(request: Request) {
  try {
    // 1. Authorization check
    const authHeader = request.headers.get('Authorization');
    const secretToken = process.env.CRON_SECRET || 'local-cron-fallback-key';
    if (authHeader !== `Bearer ${secretToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClientServer();

    // 2. Process Export Queue using the shared processor (recovering stuck jobs atomically)
    const { exportProcessed, exportJobId } = await processExportQueue(supabase);

    // 3. Activity Retention Purge (once a day or on every cron tick)
    const cutOffDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    
    // Perform purge
    const { data: deletedRows, error: deleteError } = await supabase
      .from('team_activities')
      .delete()
      .lt('created_at', cutOffDate)
      .select('id');

    if (deleteError) {
      console.error('Retention purge failed:', deleteError);
    } else {
      const affectedRows = deletedRows?.length || 0;
      if (affectedRows > 0) {
        await supabase
          .from('cleanup_logs')
          .insert({
            job_type: 'activity_retention_purge',
            affected_rows: affectedRows,
            executed_at: new Date().toISOString()
          });
      }
    }

    return NextResponse.json({
      success: true,
      exportJob: exportProcessed ? { id: exportJobId, status: 'processed' } : { status: 'idle' },
      retentionPurge: { executed: true }
    });
  } catch (err: any) {
    console.error('Cron endpoint error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

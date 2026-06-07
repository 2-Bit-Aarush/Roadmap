import { NextResponse } from 'next/server';
import { createClientServer } from '@/lib/supabase-server';
import * as XLSX from 'xlsx';

/**
 * POST /api/cron: Scheduled background processor.
 * Performs export compilation queue processing and activity retention cleanup.
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

    // 2. Recover stuck export jobs (status = 'processing' but updated_at > 15 minutes ago)
    const stuckCutOff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: stuckJobs } = await supabase
      .from('export_jobs')
      .select('id, retry_count')
      .eq('status', 'processing')
      .lt('updated_at', stuckCutOff);

    if (stuckJobs && stuckJobs.length > 0) {
      for (const job of stuckJobs) {
        if (job.retry_count < 3) {
          // Retry the job by queuing it again
          await supabase
            .from('export_jobs')
            .update({
              status: 'queued',
              retry_count: job.retry_count + 1,
              updated_at: new Date().toISOString()
            })
            .eq('id', job.id);
        } else {
          // Fail the job permanently after 3 retries
          await supabase
            .from('export_jobs')
            .update({
              status: 'failed',
              error_message: 'Job timed out and reached maximum retry limit (15m execution threshold exceeded 3 times)',
              updated_at: new Date().toISOString()
            })
            .eq('id', job.id);
        }
      }
    }

    // 3. Process Export Queue
    const { data: queueJob, error: queueError } = await supabase
      .from('export_jobs')
      .select('id, team_id, format')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (queueError) throw queueError;

    let exportProcessed = false;
    let exportJobId = null;

    if (queueJob) {
      exportJobId = queueJob.id;
      // Atomic lock update: sets status to processing only if it is still queued
      const { data: lockedJob } = await supabase
        .from('export_jobs')
        .update({
          status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', queueJob.id)
        .eq('status', 'queued')
        .select()
        .maybeSingle();

      if (lockedJob) {
        exportProcessed = true;
        try {
          // Process job
          await compileExportJob(supabase, queueJob.id, queueJob.team_id, queueJob.format);
        } catch (err: any) {
          console.error(`Export compilation failed for job ${queueJob.id}:`, err);
          await supabase
            .from('export_jobs')
            .update({
              status: 'failed',
              error_message: err.message || 'Unknown compilation error',
              updated_at: new Date().toISOString()
            })
            .eq('id', queueJob.id);
        }
      }
    }

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

/**
 * Processes the export job: loads memberships, compiles XLSX/CSV and uploads to storage.
 */
async function compileExportJob(supabase: any, jobId: string, teamId: string, format: 'xlsx' | 'csv') {
  // 1. Fetch memberships in chunks of 50
  let allMembers: any[] = [];
  let page = 0;
  const chunkSize = 1000;
  let hasMore = true;

  while (hasMore) {
    // Concurrency / Cancellation Check: verify if user aborted or cancelled in the DB
    const { data: jobCheck } = await supabase
      .from('export_jobs')
      .select('status')
      .eq('id', jobId)
      .single();

    if (!jobCheck || jobCheck.status === 'cancelled') {
      console.log(`Job ${jobId} was aborted or cancelled by user.`);
      return;
    }

    const { data: members, error } = await supabase
      .from('memberships')
      .select(`
        user_id,
        role,
        joined_at,
        current_streak,
        longest_streak,
        last_active_at,
        display_name,
        profiles (
          name,
          email
        )
      `)
      .eq('team_id', teamId)
      .eq('is_active', true)
      .range(page * chunkSize, (page + 1) * chunkSize - 1);

    if (error) throw error;
    if (!members || members.length === 0) {
      hasMore = false;
    } else {
      allMembers = [...allMembers, ...members];
      if (members.length < chunkSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  // 2. Fetch completed progress tracking nodes for resolved members
  const memberIds = allMembers.map((m) => m.user_id);
  let progressRecords: any[] = [];

  if (memberIds.length > 0) {
    const { data: progress, error: progError } = await supabase
      .from('progress_tracking')
      .select('user_id')
      .in('user_id', memberIds)
      .eq('completed', true);

    if (progError) throw progError;
    progressRecords = progress || [];
  }

  // 3. Build data worksheets
  const rosterData = allMembers.map((m) => {
    const userProgress = progressRecords.filter((p) => p.user_id === m.user_id);
    return {
      'Name': m.display_name || m.profiles?.name || 'Unknown User',
      'Email': m.profiles?.email || '',
      'Role': m.role,
      'Join Date': new Date(m.joined_at).toLocaleDateString(),
      'Completed Topics Count': userProgress.length,
      'Current Streak': m.current_streak,
      'Longest Streak': m.longest_streak,
      'Last Active': m.last_active_at ? new Date(m.last_active_at).toLocaleString() : 'N/A',
    };
  });

  const workbook = XLSX.utils.book_new();
  const rosterSheet = XLSX.utils.json_to_sheet(rosterData);
  XLSX.utils.book_append_sheet(workbook, rosterSheet, 'Team Progress');

  // 4. Write to buffer and upload to Supabase storage bucket
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: format });
  const fileName = `exports/team-${teamId}/${jobId}.${format}`;

  const { error: uploadErr } = await supabase.storage
    .from('exports')
    .upload(fileName, buffer, {
      contentType: format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv',
      upsert: true,
    });

  if (uploadErr) throw uploadErr;

  // 5. Complete job
  await supabase
    .from('export_jobs')
    .update({
      status: 'completed',
      file_url: fileName,
      row_count: rosterData.length,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 mins signed access URL expiry
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId);

  // 6. Log in export_logs
  await supabase
    .from('export_logs')
    .insert({
      team_id: teamId,
      user_id: allMembers[0]?.user_id || jobId,
      export_type: format,
      row_count: rosterData.length
    });
}

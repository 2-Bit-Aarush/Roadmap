import { NextResponse } from 'next/server';
import { verifySession, verifyTeamPermission } from '@/lib/team-security';

/**
 * GET: Retrieves export job details. Generates signed URL if status is completed.
 */
export async function GET(
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
      .select('*')
      .eq('id', jobId)
      .eq('team_id', id)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: 'Export job not found' }, { status: 404 });
    }

    let downloadUrl = null;
    
    // If completed, generate signed URL (valid for 15 minutes)
    if (job.status === 'completed' && job.file_url) {
      const { data: signedData, error: signedError } = await supabase.storage
        .from('exports')
        .createSignedUrl(job.file_url, 900); // 15 mins

      if (signedError) {
        console.error('Signed URL generation failed:', signedError);
      } else {
        downloadUrl = signedData?.signedUrl;
      }
    }

    return NextResponse.json({
      success: true,
      job: {
        ...job,
        downloadUrl,
      },
    });
  } catch (err: any) {
    console.error('Export job GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

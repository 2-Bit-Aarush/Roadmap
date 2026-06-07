import { NextResponse } from 'next/server';
import { verifySession, verifyTeamPermission, verifyTeamState } from '@/lib/team-security';

/**
 * GET: Lists pending join requests.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase } = await verifySession(request);

    // Verify admin access
    await verifyTeamState(id, 'read');
    await verifyTeamPermission(user.id, id, 'team_admin');

    const { data: requests, error } = await supabase
      .from('join_requests')
      .select('*, profiles(name, avatar_url, email)')
      .eq('team_id', id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, requests });
  } catch (err: any) {
    console.error('Requests GET error:', err);
    const status = err.message?.includes('Unauthorized') ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}

/**
 * POST: Accepts or rejects a join request.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase } = await verifySession(request);
    const body = await request.json();

    const { requestId, status } = body;
    if (!requestId || !status || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'requestId and status (approved/rejected) are required' }, { status: 400 });
    }

    // 1. Verify team states and admin permissions
    await verifyTeamState(id, 'membership_change');
    await verifyTeamPermission(user.id, id, 'team_admin');

    // 2. Fetch the join request details
    const { data: joinReq, error: fetchError } = await supabase
      .from('join_requests')
      .select('*')
      .eq('id', requestId)
      .eq('team_id', id)
      .single();

    if (fetchError || !joinReq) {
      return NextResponse.json({ error: 'Join request not found' }, { status: 404 });
    }

    if (joinReq.status !== 'pending') {
      return NextResponse.json({ error: 'Join request has already been processed' }, { status: 400 });
    }

    if (status === 'approved') {
      // 3a. Update request status
      const { error: requestUpdateErr } = await supabase
        .from('join_requests')
        .update({ status: 'approved', resolved_by: user.id, updated_at: new Date().toISOString() })
        .eq('id', requestId);

      if (requestUpdateErr) throw requestUpdateErr;

      // 3b. Add to memberships table (reactivate if existed, else insert)
      const { data: existingMember } = await supabase
        .from('memberships')
        .select('is_active')
        .eq('team_id', id)
        .eq('user_id', joinReq.user_id)
        .single();

      if (existingMember) {
        const { error: joinError } = await supabase
          .from('memberships')
          .update({ is_active: true, role: 'member', joined_at: new Date().toISOString(), invited_by: user.id })
          .eq('team_id', id)
          .eq('user_id', joinReq.user_id);

        if (joinError) throw joinError;
      } else {
        const { error: joinError } = await supabase
          .from('memberships')
          .insert({
            team_id: id,
            user_id: joinReq.user_id,
            role: 'member',
            is_active: true,
            invited_by: user.id,
          });

        if (joinError) throw joinError;
      }
    } else {
      // 4. Update request status to rejected
      const { error: requestUpdateErr } = await supabase
        .from('join_requests')
        .update({ status: 'rejected', resolved_by: user.id, updated_at: new Date().toISOString() })
        .eq('id', requestId);

      if (requestUpdateErr) throw requestUpdateErr;
    }

    return NextResponse.json({ success: true, message: `Request successfully ${status}` });
  } catch (err: any) {
    console.error('Requests POST error:', err);
    const status = err.message?.includes('Unauthorized') ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}

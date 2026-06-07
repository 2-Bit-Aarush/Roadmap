import { NextResponse } from 'next/server';
import { verifySession, verifyTeamState, checkCooldown } from '@/lib/team-security';

/**
 * GET: Resolves invitation preview details.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const { user, supabase } = await verifySession(request);

    // Apply rate limit on checking invites (5 requests per 30s)
    await checkCooldown(user.id, 'invite_spam', 30, 5);

    // Fetch invite
    const { data: invite, error } = await supabase
      .from('invites')
      .select('*, teams(*)')
      .eq('code', code)
      .single();

    if (error || !invite) {
      return NextResponse.json({ error: 'Invalid or expired invite code' }, { status: 404 });
    }

    // Verify invite validity
    const now = new Date();
    if (invite.is_revoked || new Date(invite.expires_at) < now) {
      return NextResponse.json({ error: 'Invite code has expired or been revoked' }, { status: 410 });
    }

    if (invite.max_uses !== null && invite.uses_count >= invite.max_uses) {
      return NextResponse.json({ error: 'Invite usage limit has been reached' }, { status: 410 });
    }

    const team = invite.teams;
    if (team.status === 'deleted' || team.status === 'banned') {
      return NextResponse.json({ error: 'Target team is unavailable' }, { status: 404 });
    }

    // Fetch members preview (first 5 members)
    const { data: members } = await supabase
      .from('memberships')
      .select('role, display_name, profiles(name, avatar_url)')
      .eq('team_id', team.id)
      .eq('is_active', true)
      .limit(5);

    // Fetch total member count
    const { count: memberCount } = await supabase
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', team.id)
      .eq('is_active', true);

    return NextResponse.json({
      success: true,
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        icon: team.icon,
        goal: team.goal,
        visibility: team.visibility,
        memberCount: memberCount || 0,
        membersPreview: members || [],
        assignedDisplayName: invite.display_name,
      },
    });
  } catch (err: any) {
    console.error('Invite GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST: Joins the team using the invite code.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const { user, supabase } = await verifySession(request);

    // Apply rate limit on accepting invites (5 requests per 30s)
    await checkCooldown(user.id, 'invite_spam', 30, 5);

    // 1. Fetch and validate invite
    const { data: invite, error } = await supabase
      .from('invites')
      .select('*, teams(*)')
      .eq('code', code)
      .single();

    if (error || !invite) {
      return NextResponse.json({ error: 'Invalid or expired invite code' }, { status: 404 });
    }

    const now = new Date();
    if (invite.is_revoked || new Date(invite.expires_at) < now) {
      return NextResponse.json({ error: 'Invite code has expired' }, { status: 410 });
    }

    if (invite.max_uses !== null && invite.uses_count >= invite.max_uses) {
      return NextResponse.json({ error: 'Invite limit exceeded' }, { status: 410 });
    }

    const team = invite.teams;
    await verifyTeamState(team.id, 'membership_change');

    // Check member limit at API layer before letting user join
    if (team.member_limit !== null) {
      const { count: activeCount } = await supabase
        .from('memberships')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', team.id)
        .eq('is_active', true);

      if (activeCount !== null && activeCount >= team.member_limit) {
        return NextResponse.json({ error: `Team size limit of ${team.member_limit} members reached` }, { status: 400 });
      }
    }

    // 2. Check if user is already an active member of this team
    const { data: existingMember } = await supabase
      .from('memberships')
      .select('is_active')
      .eq('team_id', team.id)
      .eq('user_id', user.id)
      .single();

    if (existingMember && existingMember.is_active) {
      return NextResponse.json({ success: true, status: 'already_joined', teamId: team.id });
    }

    // 3. Resolve team settings
    const settings = team.settings as any;
    const approvalMode = settings?.membership?.approval_mode === true;

    // 4. Increment uses count on invite
    await supabase
      .from('invites')
      .update({ uses_count: invite.uses_count + 1 })
      .eq('id', invite.id);

    if (approvalMode) {
      // Create join request (Approval Mode)
      const { error: requestError } = await supabase
        .from('join_requests')
        .insert({
          team_id: team.id,
          user_id: user.id,
          status: 'pending',
        });

      if (requestError) throw requestError;

      return NextResponse.json({ success: true, status: 'pending_approval', teamId: team.id });
    } else {
      // Directly join
      if (existingMember) {
        // Reactivate membership
        const { error: joinError } = await supabase
          .from('memberships')
          .update({
            is_active: true,
            role: 'member',
            joined_at: new Date().toISOString(),
            display_name: invite.display_name,
          })
          .eq('team_id', team.id)
          .eq('user_id', user.id);

        if (joinError) throw joinError;
      } else {
        const { error: joinError } = await supabase
          .from('memberships')
          .insert({
            team_id: team.id,
            user_id: user.id,
            role: 'member',
            is_active: true,
            invited_by: invite.created_by,
            display_name: invite.display_name,
          });

        if (joinError) throw joinError;
      }

      return NextResponse.json({ success: true, status: 'joined', teamId: team.id });
    }
  } catch (err: any) {
    console.error('Invite POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

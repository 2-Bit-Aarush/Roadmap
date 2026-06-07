import { NextResponse } from 'next/server';
import { verifySession, isWebsiteAdmin } from '@/lib/team-security';
import { rateLimit } from '@/lib/rate-limit';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. Rate limit check
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    if (!rateLimit(ip, 60, 60 * 1000)) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    // 2. Resolve session user
    const { user, supabase } = await verifySession(request);

    // 3. Verify global admin
    const isAdmin = await isWebsiteAdmin(user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { status, suspendInvites, promoteAdminUserId, demoteAdminUserId } = body;

    // Fetch team first to get current settings and owner_id
    const { data: team, error: fetchError } = await supabase
      .from('teams')
      .select('status, settings, owner_id')
      .eq('id', id)
      .single();

    if (fetchError || !team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const updates: any = {};
    const settings = (team.settings as any) || {};
    if (!settings.admin) {
      settings.admin = { suspend_invites: false, lock_editing: false, freeze_activity: false };
    }

    // Handle Ban, Archive, Unban, Unarchive (status update)
    if (status !== undefined) {
      updates.status = status;
      if (status === 'banned') {
        // Automatically suspend invites when banned
        settings.admin = {
          ...settings.admin,
          suspend_invites: true
        };
        updates.settings = settings;
      }
    }

    // Handle Toggle Invites (suspendInvites)
    if (suspendInvites !== undefined) {
      settings.admin = {
        ...settings.admin,
        suspend_invites: suspendInvites
      };
      updates.settings = settings;
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('teams')
        .update(updates)
        .eq('id', id);

      if (updateError) throw updateError;

      // Log activities/audit logs
      if (status === 'banned') {
        await supabase.from('team_activities').insert({
          team_id: id,
          actor_id: user.id,
          activity_type: 'team_banned',
          metadata: { reason: 'Banned by website administrator' }
        });
      } else if (status === 'archived') {
        await supabase.from('team_activities').insert({
          team_id: id,
          actor_id: user.id,
          activity_type: 'team_archived',
          metadata: { reason: 'Archived by website administrator' }
        });
      }
    }

    // Handle member role changes (promote / demote team admin)
    if (promoteAdminUserId) {
      const { error: promoteError } = await supabase
        .from('memberships')
        .update({ role: 'team_admin' })
        .eq('team_id', id)
        .eq('user_id', promoteAdminUserId);

      if (promoteError) throw promoteError;

      await supabase.from('team_activities').insert({
        team_id: id,
        actor_id: user.id,
        activity_type: 'member_promoted',
        metadata: { target_user_id: promoteAdminUserId, role: 'team_admin' }
      });
    }

    if (demoteAdminUserId) {
      // Safety check: Cannot demote the team owner
      if (team.owner_id === demoteAdminUserId) {
        return NextResponse.json({ error: 'Cannot demote the team owner' }, { status: 400 });
      }

      const { error: demoteError } = await supabase
        .from('memberships')
        .update({ role: 'member' })
        .eq('team_id', id)
        .eq('user_id', demoteAdminUserId);

      if (demoteError) throw demoteError;

      await supabase.from('team_activities').insert({
        team_id: id,
        actor_id: user.id,
        activity_type: 'member_demoted',
        metadata: { target_user_id: demoteAdminUserId, role: 'member' }
      });
    }

    // Log admin action general audit
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: `admin_manage_team_${status || 'update'}`,
      target_type: 'team',
      target_id: id,
      details: { updates, promoteAdminUserId, demoteAdminUserId }
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Admin team PUT error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. Rate limit check
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    if (!rateLimit(ip, 60, 60 * 1000)) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    // 2. Resolve session user
    const { user, supabase } = await verifySession(request);

    // 3. Verify global admin
    const isAdmin = await isWebsiteAdmin(user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Disband Team behavior: soft delete, preserve audit logs
    const { error: deleteError } = await supabase
      .from('teams')
      .update({
        status: 'deleted',
        deleted_at: new Date().toISOString(),
        deleted_by: user.id
      })
      .eq('id', id);

    if (deleteError) throw deleteError;

    // Log admin action audit
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'admin_disband_team',
      target_type: 'team',
      target_id: id,
      details: { reason: 'Disbanded by website administrator' }
    });

    return NextResponse.json({ success: true, message: 'Team disbanded successfully' });
  } catch (err: any) {
    console.error('Admin team DELETE error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

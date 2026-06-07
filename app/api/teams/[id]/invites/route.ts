import { NextResponse } from 'next/server';
import { verifySession, verifyTeamPermission, verifyTeamState, checkCooldown } from '@/lib/team-security';
import crypto from 'crypto';

/**
 * GET: Lists active invites of a team.
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

    const { data: invites, error } = await supabase
      .from('invites')
      .select('*')
      .eq('team_id', id)
      .eq('is_revoked', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, invites });
  } catch (err: any) {
    console.error('Invites GET error:', err);
    const status = err.message?.includes('Unauthorized') ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}

/**
 * POST: Generates a new invite code with specific expiry and use limits.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase } = await verifySession(request);
    const body = await request.json();

    // 1. Verify team states and admin permissions
    await verifyTeamState(id, 'create_invite');
    await verifyTeamPermission(user.id, id, 'team_admin');

    // 2. Check persistent invite cooldown (1 invite code per 10s per user)
    await checkCooldown(user.id, 'invite_spam', 10, 1);

    const { expiresHours, maxUses, displayName } = body;
    let nameTrimmed = null;
    if (displayName !== undefined && displayName !== null) {
      if (!displayName.trim()) {
        return NextResponse.json({ error: 'Display name cannot be empty' }, { status: 400 });
      }
      nameTrimmed = displayName.trim();
      if (nameTrimmed.length < 2 || nameTrimmed.length > 40) {
        return NextResponse.json({ error: 'Display name must be between 2 and 40 characters' }, { status: 400 });
      }

      // Check duplicate in memberships
      const { data: activeMembers } = await supabase
        .from('memberships')
        .select('display_name, profiles(name)')
        .eq('team_id', id)
        .eq('is_active', true);

      const isDuplicate = activeMembers?.some((m: any) => {
        const name = m.display_name || m.profiles?.name || '';
        return name.toLowerCase() === nameTrimmed.toLowerCase();
      });

      if (isDuplicate) {
        return NextResponse.json({ error: 'Display name is already taken inside this team.' }, { status: 400 });
      }
    }

    const hours = parseInt(expiresHours || '24', 10);
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    // Generate unique random code (minimum 32 chars, URL safe)
    const code = crypto.randomBytes(24).toString('base64url');

    // 3. Create invite code record
    const { data: invite, error } = await supabase
      .from('invites')
      .insert({
        team_id: id,
        code,
        created_by: user.id,
        expires_at: expiresAt.toISOString(),
        max_uses: maxUses ? parseInt(maxUses, 10) : null,
        display_name: nameTrimmed,
      })
      .select()
      .single();

    if (error) throw error;

    // Log invite activity
    await supabase
      .from('team_activities')
      .insert({
        team_id: id,
        actor_id: user.id,
        activity_type: 'invite_created',
        metadata: { code, max_uses: maxUses },
      });

    return NextResponse.json({ success: true, invite });
  } catch (err: any) {
    console.error('Invites POST error:', err);
    const status = err.message?.includes('Unauthorized') ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}

/**
 * DELETE: Revokes/invalidates all active invites for the team.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase } = await verifySession(request);

    // Verify admin access
    await verifyTeamState(id, 'create_invite');
    await verifyTeamPermission(user.id, id, 'team_admin');

    const { error } = await supabase
      .from('invites')
      .update({ is_revoked: true })
      .eq('team_id', id)
      .eq('is_revoked', false);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'All active team invites invalidated successfully' });
  } catch (err: any) {
    console.error('Invites DELETE error:', err);
    const status = err.message?.includes('Unauthorized') ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}

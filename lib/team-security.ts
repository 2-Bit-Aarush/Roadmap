import { createClientServer } from './supabase-server';

export interface TeamSettings {
  privacy: {
    progress_visibility: 'public' | 'members' | 'admins' | 'cryptic';
    history_visibility: 'public' | 'members' | 'admins';
    leaderboard_visibility: 'exact' | 'anonymous' | 'disabled';
    export_permissions: 'website_admin_only' | 'team_admin_only' | 'allowed_members' | 'disabled';
  };
  membership: {
    default_invite_expiry_hours: number;
    approval_mode: boolean;
    max_invite_uses: number | null;
  };
  admin: {
    suspend_invites: boolean;
    lock_editing: boolean;
    freeze_activity: boolean;
  };
}

export type TeamRole = 'website_admin' | 'team_admin' | 'mentor' | 'member';

const ROLE_LEVELS: Record<TeamRole, number> = {
  website_admin: 4,
  team_admin: 3,
  mentor: 2,
  member: 1,
};

/**
 * Verifies active session and returns authenticated user details.
 */
export async function verifySession(request: Request) {
  const supabase = await createClientServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return { user, supabase };
}

/**
 * Checks if a user is a website administrator.
 */
export async function isWebsiteAdmin(userId: string): Promise<boolean> {
  const supabase = await createClientServer();
  
  const { data: adminCheck } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  const { data: adminRoleCheck } = await supabase
    .from('admin_roles')
    .select('role')
    .eq('id', userId)
    .single();

  return (
    adminCheck?.role === 'website_admin' || 
    adminRoleCheck?.role === 'admin'
  );
}

/**
 * Resolves user role in team and checks if role >= minRole requirement.
 */
export async function verifyTeamPermission(
  userId: string,
  teamId: string,
  minRole: TeamRole
): Promise<{ role: TeamRole; isOwner: boolean }> {
  const supabase = await createClientServer();

  // 1. Check if global website_admin
  const { data: adminCheck } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  const { data: adminRoleCheck } = await supabase
    .from('admin_roles')
    .select('role')
    .eq('id', userId)
    .single();

  const isGlobalAdmin = 
    adminCheck?.role === 'website_admin' || 
    adminRoleCheck?.role === 'admin';

  if (isGlobalAdmin) {
    return { role: 'website_admin', isOwner: true };
  }

  // 2. Fetch membership role
  const { data: member } = await supabase
    .from('memberships')
    .select('role, teams(owner_id)')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (!member) {
    throw new Error('Forbidden: Not a team member');
  }

  const role = member.role as TeamRole;
  // @ts-ignore
  const isOwner = member.teams?.owner_id === userId;

  const userLevel = ROLE_LEVELS[role] || 0;
  const requiredLevel = ROLE_LEVELS[minRole];

  if (userLevel < requiredLevel) {
    throw new Error('Forbidden: Insufficient privileges');
  }

  return { role, isOwner };
}

/**
 * Checks team status states and rejects actions if restricted/banned/archived/frozen.
 */
export async function verifyTeamState(
  teamId: string,
  actionType: 'edit_settings' | 'membership_change' | 'create_invite' | 'read'
) {
  const supabase = await createClientServer();
  
  const { data: team } = await supabase
    .from('teams')
    .select('status, settings')
    .eq('id', teamId)
    .single();

  if (!team) {
    throw new Error('Team not found');
  }

  const status = team.status;
  const settings = team.settings as unknown as TeamSettings;

  if (status === 'deleted') {
    throw new Error('Team is deleted');
  }

  if (status === 'banned') {
    if (actionType === 'read') {
      return; // Viewing is allowed for banned teams
    }
    throw new Error('This team is banned. All operations are disabled.');
  }

  if (settings?.admin?.suspend_invites && (actionType === 'create_invite' || actionType === 'membership_change')) {
    throw new Error('Invites and new joins are suspended for this team.');
  }

  if (actionType === 'read') {
    return; // Viewing is allowed for active/restricted/archived teams
  }

  if (status === 'archived') {
    throw new Error('This team is archived and is read-only.');
  }

  if (status === 'restricted' && actionType === 'edit_settings') {
    throw new Error('This team is restricted and settings modifications are locked.');
  }

  if (settings?.admin?.freeze_activity && actionType !== 'read') {
    throw new Error('Team activity has been frozen by administration.');
  }
}

/**
 * Persistent sliding cooldown database rate limiter.
 */
export async function checkCooldown(
  userId: string,
  action: 'invite_spam' | 'export_spam' | 'agenda_spam' | 'resource_spam',
  limitSec: number = 30,
  maxCount: number = 1
) {
  const supabase = await createClientServer();
  const now = new Date();
  const cooldownWindowStart = new Date(now.getTime() - limitSec * 1000);

  // Read rate limit
  const { data: limitData } = await supabase
    .from('action_limits')
    .select('count, last_used')
    .eq('user_id', userId)
    .eq('action', action)
    .single();

  if (limitData) {
    const lastUsed = new Date(limitData.last_seen || limitData.last_used);
    
    if (lastUsed > cooldownWindowStart) {
      if (limitData.count >= maxCount) {
        throw new Error(`Rate limit exceeded. Please wait ${limitSec} seconds before retrying.`);
      }
      
      // Update count within window
      await supabase
        .from('action_limits')
        .update({
          count: limitData.count + 1,
          last_used: now.toISOString(),
        })
        .eq('user_id', userId)
        .eq('action', action);
    } else {
      // Reset window
      await supabase
        .from('action_limits')
        .update({
          count: 1,
          last_used: now.toISOString(),
        })
        .eq('user_id', userId)
        .eq('action', action);
    }
  } else {
    // Insert new limit row
    await supabase
      .from('action_limits')
      .insert({
        user_id: userId,
        action,
        count: 1,
        last_used: now.toISOString(),
      });
  }
}

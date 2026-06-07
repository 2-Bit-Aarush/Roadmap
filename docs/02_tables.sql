-- ====================================================
-- TABLE CREATION
-- ====================================================

-- ====================================================
-- STEP 3 — BASE TABLES
-- ====================================================

-- 1. Create Cleanup Logs Table FIRST (No foreign keys)
CREATE TABLE IF NOT EXISTS public.cleanup_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,
    affected_rows INTEGER NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. External Base Skeletons (safe if empty db)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    full_name TEXT,
    avatar_url TEXT,
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.admin_roles (
    id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
    role TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.progress_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    node_id UUID,
    completed BOOLEAN DEFAULT false NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id UUID,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure profiles role column exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- 3. Core Teams Table
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    goal TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'restricted', 'archived', 'banned', 'deleted')) DEFAULT 'active',
    status_reason TEXT,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private', 'invite_only')) DEFAULT 'public',
    member_limit INTEGER DEFAULT NULL,
    settings JSONB NOT NULL DEFAULT '{"privacy": {"progress_visibility": "members", "history_visibility": "members", "leaderboard_visibility": "exact", "export_permissions": "team_admin"}, "membership": {"default_invite_expiry_hours": 24, "approval_mode": false, "max_invite_uses": null}, "admin": {"suspend_invites": false, "lock_editing": false, "freeze_activity": false}}'::jsonb
);

-- 4. Team Badges Table (No foreign keys)
CREATE TABLE IF NOT EXISTS public.team_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    unlock_rule JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 5. Action Limits Table
CREATE TABLE IF NOT EXISTS public.action_limits (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    last_used TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    count INTEGER DEFAULT 0 NOT NULL,
    PRIMARY KEY (user_id, action)
);


-- ====================================================
-- STEP 4 — DEPENDENT TABLES
-- ====================================================

-- 1. Create Memberships table
CREATE TABLE IF NOT EXISTS public.memberships (
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('team_admin', 'mentor', 'member')) DEFAULT 'member',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    is_pinned BOOLEAN DEFAULT false NOT NULL,
    is_favorite BOOLEAN DEFAULT false NOT NULL,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    current_streak INTEGER DEFAULT 0 NOT NULL,
    longest_streak INTEGER DEFAULT 0 NOT NULL,
    PRIMARY KEY (team_id, user_id)
);

-- 2. Create Invites table
CREATE TABLE IF NOT EXISTS public.invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
    code TEXT NOT NULL UNIQUE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    max_uses INTEGER DEFAULT NULL,
    uses_count INTEGER DEFAULT 0 NOT NULL,
    is_revoked BOOLEAN DEFAULT false NOT NULL
);

-- 3. Create Join Requests table
CREATE TABLE IF NOT EXISTS public.join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT unique_pending_request UNIQUE (team_id, user_id, status)
);

-- 4. Create Team Resources table
CREATE TABLE IF NOT EXISTS public.team_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Create Team Agendas table
CREATE TABLE IF NOT EXISTS public.team_agendas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')) DEFAULT 'active',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Create Team Challenges table
CREATE TABLE IF NOT EXISTS public.team_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')) DEFAULT 'active',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Create Team Milestones table
CREATE TABLE IF NOT EXISTS public.team_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    completion_requirement JSONB NOT NULL DEFAULT '{}'::jsonb,
    reward TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')) DEFAULT 'active'
);

-- 8. Create Team Activities table
CREATE TABLE IF NOT EXISTS public.team_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('joined_team', 'completed_node', 'invite_created', 'goal_completed', 'agenda_updated', 'resource_added', 'member_removed', 'export_created', 'challenge_completed', 'milestone_unlocked', 'team_banned', 'team_archived', 'ownership_transferred', 'member_promoted', 'member_demoted', 'badge_unlocked')),
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Create Export Jobs table
CREATE TABLE IF NOT EXISTS public.export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
    requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'expired', 'cancelled')) DEFAULT 'queued',
    file_url TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    row_count INTEGER,
    format TEXT NOT NULL CHECK (format IN ('xlsx', 'csv')) DEFAULT 'xlsx',
    error_message TEXT,
    retry_count INTEGER DEFAULT 0 NOT NULL
);

-- 10. Create Export Logs table
CREATE TABLE IF NOT EXISTS public.export_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
    export_type TEXT NOT NULL,
    row_count INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11. Create Team Metrics Cache table
CREATE TABLE IF NOT EXISTS public.team_metrics_cache (
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE PRIMARY KEY,
    completion_rate NUMERIC DEFAULT 0 NOT NULL,
    active_members INTEGER DEFAULT 0 NOT NULL,
    weekly_activity INTEGER DEFAULT 0 NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ====================================================
-- STEP 5 — COLUMNS ADDITIONS UPGRADES
-- ====================================================

-- Teams column upgrades
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS goal TEXT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS status_reason TEXT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS member_limit INTEGER DEFAULT NULL;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{"privacy": {"progress_visibility": "members", "history_visibility": "members", "leaderboard_visibility": "exact", "export_permissions": "team_admin"}, "membership": {"default_invite_expiry_hours": 24, "approval_mode": false, "max_invite_uses": null}, "admin": {"suspend_invites": false, "lock_editing": false, "freeze_activity": false}}'::jsonb;

-- Memberships column upgrades
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0;
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0;

-- Invites column upgrades
ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS max_uses INTEGER DEFAULT NULL;
ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS uses_count INTEGER DEFAULT 0;
ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN DEFAULT false;

-- Export Jobs column upgrades
ALTER TABLE public.export_jobs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'queued';
ALTER TABLE public.export_jobs ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.export_jobs ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.export_jobs ADD COLUMN IF NOT EXISTS row_count INTEGER;
ALTER TABLE public.export_jobs ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'xlsx';
ALTER TABLE public.export_jobs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.export_jobs ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Cleanup Logs column upgrades
ALTER TABLE public.cleanup_logs ADD COLUMN IF NOT EXISTS job_type TEXT;
ALTER TABLE public.cleanup_logs ADD COLUMN IF NOT EXISTS affected_rows INTEGER;
ALTER TABLE public.cleanup_logs ADD COLUMN IF NOT EXISTS executed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

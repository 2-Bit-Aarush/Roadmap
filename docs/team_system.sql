-- ====================================================
-- TEAM SYSTEM MIGRATION SCHEMA (UNIFIED)
-- REORDERED FOR SAFE IDEMPOTENCY & FRESH DB RUNS
-- ====================================================

-- ====================================================
-- STEP 1 — EXTENSIONS
-- ====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ====================================================
-- FUNCTIONS
-- ====================================================

-- ====================================================
-- STEP 2 — FUNCTIONS REQUIRED EARLY & HELPERS
-- ====================================================

-- 1. Check if user is a global website admin
CREATE OR REPLACE FUNCTION public.is_website_admin(user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles WHERE id = user_id AND role = 'website_admin'
  ) OR EXISTS (
    SELECT 1 FROM public.admin_roles WHERE id = user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql;

-- 2. Map role text to hierarchy level index
CREATE OR REPLACE FUNCTION public.get_role_level(role_name TEXT)
RETURNS INT AS $$
BEGIN
  RETURN CASE role_name
    WHEN 'website_admin' THEN 4
    WHEN 'team_admin' THEN 3
    WHEN 'mentor' THEN 2
    WHEN 'member' THEN 1
    ELSE 0
  END;
END;
$$ LANGUAGE plpgsql;

-- 3. Resolve active team membership role
CREATE OR REPLACE FUNCTION public.get_team_role(user_id UUID, team_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Website admin override
  IF public.is_website_admin(user_id) THEN
    RETURN 'website_admin';
  END IF;

  SELECT role INTO v_role 
  FROM public.memberships 
  WHERE memberships.team_id = $2 
    AND memberships.user_id = $1 
    AND memberships.is_active = true;

  RETURN v_role;
END;
$$ LANGUAGE plpgsql;

-- 4. Check if user can manage team
CREATE OR REPLACE FUNCTION public.can_manage_team(user_id UUID, team_id UUID)
RETURNS BOOLEAN SECURITY DEFINER AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := public.get_team_role(user_id, team_id);
  RETURN v_role IN ('website_admin', 'team_admin');
END;
$$ LANGUAGE plpgsql;

-- 5. RLS query view checker
CREATE OR REPLACE FUNCTION public.can_view_team(user_id UUID, team_id UUID)
RETURNS BOOLEAN SECURITY DEFINER AS $$
DECLARE
  v_visibility TEXT;
  v_status TEXT;
  v_is_member BOOLEAN;
BEGIN
  IF public.is_website_admin(user_id) THEN
    RETURN TRUE;
  END IF;

  SELECT visibility, status INTO v_visibility, v_status
  FROM public.teams
  WHERE id = team_id;

  IF v_status = 'deleted' THEN
    RETURN FALSE;
  END IF;

  IF v_status = 'banned' THEN
    RETURN FALSE;
  END IF;

  IF v_visibility = 'public' THEN
    RETURN TRUE;
  END IF;

  -- Checks membership presence
  v_is_member := EXISTS (
    SELECT 1 FROM public.memberships
    WHERE memberships.team_id = team_id
      AND memberships.user_id = user_id
      AND memberships.is_active = true
  );

  RETURN v_is_member;
END;
$$ LANGUAGE plpgsql;

-- 6. Trigger to handle team creator membership initialization
CREATE OR REPLACE FUNCTION public.handle_team_creation()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert membership
  INSERT INTO public.memberships (team_id, user_id, role, is_active)
  VALUES (NEW.id, NEW.created_by, 'team_admin', true);

  -- Update owner_id on team if null
  IF NEW.owner_id IS NULL THEN
    UPDATE public.teams SET owner_id = NEW.created_by WHERE id = NEW.id;
  END IF;

  -- Create cache row
  INSERT INTO public.team_metrics_cache (team_id) VALUES (NEW.id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Trigger to validate membership changes (hierarchy + owner safeguard)
CREATE OR REPLACE FUNCTION public.enforce_membership_hierarchy()
RETURNS TRIGGER AS $$
DECLARE
  v_requestor_role TEXT;
  v_requestor_level INT;
  v_target_level INT;
  v_new_level INT;
  v_admin_count INT;
  v_team_owner UUID;
  v_is_owner BOOLEAN;
BEGIN
  -- System transactions bypass
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Load credentials
  SELECT owner_id INTO v_team_owner FROM public.teams WHERE id = COALESCE(NEW.team_id, OLD.team_id);
  v_requestor_role := public.get_team_role(auth.uid(), COALESCE(NEW.team_id, OLD.team_id));
  v_requestor_level := public.get_role_level(v_requestor_role);

  IF TG_OP = 'INSERT' THEN
    v_new_level := public.get_role_level(NEW.role);
    
    -- Check permissions
    IF v_requestor_level < 3 THEN
      RAISE EXCEPTION 'Insufficient permissions to add members';
    END IF;
    
    IF v_new_level >= v_requestor_level AND v_requestor_role != 'website_admin' THEN
      RAISE EXCEPTION 'Cannot assign a role equal to or higher than your own';
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    v_target_level := public.get_role_level(OLD.role);
    v_new_level := public.get_role_level(NEW.role);

    -- Owners can do anything, Website admins can do anything
    IF v_requestor_role = 'website_admin' OR auth.uid() = v_team_owner THEN
      -- If demoting the owner, throw error
      IF OLD.user_id = v_team_owner AND NEW.role != 'team_admin' THEN
        RAISE EXCEPTION 'Team owner must remain a team_admin. Transfer ownership first.';
      END IF;
      RETURN NEW;
    END IF;

    -- Block demotion of the final team admin
    IF OLD.role = 'team_admin' AND NEW.role != 'team_admin' THEN
      SELECT COUNT(*) INTO v_admin_count 
      FROM public.memberships 
      WHERE team_id = OLD.team_id AND role = 'team_admin' AND is_active = true;

      IF v_admin_count <= 1 THEN
        RAISE EXCEPTION 'Cannot demote the final team administrator. Demote blocked.';
      END IF;
    END IF;

    -- Standard hierarchy validation
    IF v_requestor_level < 3 THEN
      RAISE EXCEPTION 'Insufficient permissions to update membership roles';
    END IF;

    IF v_target_level >= v_requestor_level THEN
      RAISE EXCEPTION 'Cannot edit memberships of equal or higher ranked members';
    END IF;

    IF v_new_level >= v_requestor_level AND v_requestor_role != 'website_admin' THEN
      RAISE EXCEPTION 'Cannot elevate members to a rank equal or higher than your own';
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    v_target_level := public.get_role_level(OLD.role);
    v_is_owner := OLD.user_id = v_team_owner;

    -- Prevent removal of team owner
    IF v_is_owner THEN
      RAISE EXCEPTION 'Team owner cannot be removed. Transfer ownership or delete the team.';
    END IF;

    -- Prevent removing the last admin
    IF OLD.role = 'team_admin' THEN
      SELECT COUNT(*) INTO v_admin_count 
      FROM public.memberships 
      WHERE team_id = OLD.team_id AND role = 'team_admin' AND is_active = true;

      IF v_admin_count <= 1 THEN
        RAISE EXCEPTION 'Cannot remove the final team administrator. Demote/removal blocked.';
      END IF;
    END IF;

    -- Owners/website admins bypass remaining checks
    IF auth.uid() = v_team_owner OR v_requestor_role = 'website_admin' THEN
      RETURN OLD;
    END IF;

    -- Standard hierarchy removal validation
    IF v_requestor_level < 3 AND auth.uid() != OLD.user_id THEN
      RAISE EXCEPTION 'Insufficient permissions to remove members';
    END IF;

    IF v_target_level >= v_requestor_level AND auth.uid() != OLD.user_id THEN
      RAISE EXCEPTION 'Cannot remove users with equal or higher roles';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Trigger to validate team size limits (with transactional lock SELECT FOR UPDATE)
CREATE OR REPLACE FUNCTION public.check_team_size_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  -- Lock the team row to prevent parallel joins bypassing the limit
  SELECT member_limit INTO v_limit FROM public.teams WHERE id = NEW.team_id FOR UPDATE;
  
  IF v_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count FROM public.memberships WHERE team_id = NEW.team_id AND is_active = true;
    IF v_count >= v_limit THEN
      RAISE EXCEPTION 'Team size limit of % members reached', v_limit;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Trigger to validate team states during write events
CREATE OR REPLACE FUNCTION public.enforce_team_state_rules()
RETURNS TRIGGER AS $$
DECLARE
  v_team_status TEXT;
  v_team_settings JSONB;
BEGIN
  -- Get team status
  SELECT status, settings INTO v_team_status, v_team_settings
  FROM public.teams
  WHERE id = COALESCE(NEW.team_id, OLD.team_id);

  IF v_team_status = 'banned' THEN
    RAISE EXCEPTION 'This team is banned and all actions are disabled';
  ELSIF v_team_status = 'deleted' THEN
    RAISE EXCEPTION 'This team is deleted';
  ELSIF v_team_status = 'archived' THEN
    RAISE EXCEPTION 'This team is archived and is read-only';
  END IF;

  -- Check if activity is frozen in settings
  IF v_team_settings->'admin'->>'freeze_activity' = 'true' THEN
    RAISE EXCEPTION 'Team activity is frozen by administration';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Audit Log Triggers
CREATE OR REPLACE FUNCTION public.log_team_audit()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_details JSONB;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF TG_OP = 'INSERT' THEN
    v_action := 'create_team';
    v_details := jsonb_build_object('name', NEW.name, 'visibility', NEW.visibility);
    INSERT INTO public.audit_logs (user_id, action, target_type, target_id, details)
    VALUES (v_user_id, v_action, 'team', NEW.id, v_details);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update_team';
    v_details := jsonb_build_object(
      'old_status', OLD.status,
      'new_status', NEW.status,
      'old_visibility', OLD.visibility,
      'new_visibility', NEW.visibility,
      'old_name', OLD.name,
      'new_name', NEW.name,
      'old_settings', OLD.settings,
      'new_settings', NEW.settings,
      'old_owner', OLD.owner_id,
      'new_owner', NEW.owner_id
    );
    
    -- Log activity if status changes or ownership transfers
    IF OLD.owner_id != NEW.owner_id THEN
      INSERT INTO public.team_activities (team_id, actor_id, activity_type, metadata)
      VALUES (NEW.id, v_user_id, 'ownership_transferred', jsonb_build_object('old_owner', OLD.owner_id, 'new_owner', NEW.owner_id));
    END IF;
    IF OLD.status != NEW.status THEN
      IF NEW.status = 'banned' THEN
        INSERT INTO public.team_activities (team_id, actor_id, activity_type, metadata)
        VALUES (NEW.id, v_user_id, 'team_banned', jsonb_build_object('reason', NEW.status_reason));
      ELSIF NEW.status = 'archived' THEN
        INSERT INTO public.team_activities (team_id, actor_id, activity_type, metadata)
        VALUES (NEW.id, v_user_id, 'team_archived', jsonb_build_object('reason', NEW.status_reason));
      END IF;
    END IF;

    INSERT INTO public.audit_logs (user_id, action, target_type, target_id, details)
    VALUES (v_user_id, v_action, 'team', NEW.id, v_details);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete_team';
    v_details := jsonb_build_object('name', OLD.name);
    INSERT INTO public.audit_logs (user_id, action, target_type, target_id, details)
    VALUES (v_user_id, v_action, 'team', OLD.id, v_details);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.log_membership_audit()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_details JSONB;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF TG_OP = 'INSERT' THEN
    v_action := 'add_member';
    v_details := jsonb_build_object('member_id', NEW.user_id, 'role', NEW.role);
    
    INSERT INTO public.team_activities (team_id, actor_id, activity_type, metadata)
    VALUES (NEW.team_id, v_user_id, 'joined_team', jsonb_build_object('member_id', NEW.user_id));

    INSERT INTO public.audit_logs (user_id, action, target_type, target_id, details)
    VALUES (v_user_id, v_action, 'membership', NEW.team_id, v_details);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update_member_role';
    v_details := jsonb_build_object(
      'member_id', NEW.user_id,
      'old_role', OLD.role,
      'new_role', NEW.role,
      'old_active', OLD.is_active,
      'new_active', NEW.is_active
    );
    
    IF OLD.role != NEW.role THEN
      IF public.get_role_level(NEW.role) > public.get_role_level(OLD.role) THEN
        INSERT INTO public.team_activities (team_id, actor_id, activity_type, metadata)
        VALUES (NEW.team_id, v_user_id, 'member_promoted', jsonb_build_object('member_id', NEW.user_id, 'new_role', NEW.role));
      ELSE
        INSERT INTO public.team_activities (team_id, actor_id, activity_type, metadata)
        VALUES (NEW.team_id, v_user_id, 'member_demoted', jsonb_build_object('member_id', NEW.user_id, 'new_role', NEW.role));
      END IF;
    END IF;

    INSERT INTO public.audit_logs (user_id, action, target_type, target_id, details)
    VALUES (v_user_id, v_action, 'membership', NEW.team_id, v_details);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'remove_member';
    v_details := jsonb_build_object('member_id', OLD.user_id, 'role', OLD.role);
    
    INSERT INTO public.team_activities (team_id, actor_id, activity_type, metadata)
    VALUES (OLD.team_id, v_user_id, 'member_removed', jsonb_build_object('member_id', OLD.user_id));

    INSERT INTO public.audit_logs (user_id, action, target_type, target_id, details)
    VALUES (v_user_id, v_action, 'membership', OLD.team_id, v_details);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Metrics cache update triggers
CREATE OR REPLACE FUNCTION public.refresh_team_metrics_cache_for_team(v_team_id UUID)
RETURNS VOID SECURITY DEFINER AS $$
DECLARE
  v_active_count INT;
  v_weekly_act INT;
  v_completion NUMERIC;
BEGIN
  -- Compute active members count
  SELECT COUNT(*) INTO v_active_count 
  FROM public.memberships 
  WHERE team_id = v_team_id AND memberships.is_active = true;

  -- Compute weekly activity count
  SELECT COUNT(*) INTO v_weekly_act 
  FROM public.team_activities 
  WHERE team_id = v_team_id AND created_at > (now() - INTERVAL '7 days');

  -- Compute average completed nodes count per active member
  SELECT COALESCE(AVG(p_count), 0) INTO v_completion
  FROM (
    SELECT COUNT(p.node_id) as p_count
    FROM public.memberships m
    LEFT JOIN public.progress_tracking p ON p.user_id = m.user_id AND p.completed = true
    WHERE m.team_id = v_team_id AND m.is_active = true
    GROUP BY m.user_id
  ) as sub;

  -- Upsert
  INSERT INTO public.team_metrics_cache (team_id, completion_rate, active_members, weekly_activity, updated_at)
  VALUES (v_team_id, v_completion, v_active_count, v_weekly_act, now())
  ON CONFLICT (team_id) DO UPDATE SET
    completion_rate = EXCLUDED.completion_rate,
    active_members = EXCLUDED.active_members,
    weekly_activity = EXCLUDED.weekly_activity,
    updated_at = now();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.refresh_team_metrics_cache()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.refresh_team_metrics_cache_for_team(COALESCE(NEW.team_id, OLD.team_id));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Trigger to sync metrics cache when users progress in roadmaps
CREATE OR REPLACE FUNCTION public.refresh_cache_on_progress_change()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  r RECORD;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);
  
  FOR r IN 
    SELECT team_id FROM public.memberships 
    WHERE user_id = v_user_id AND is_active = true
  LOOP
    PERFORM public.refresh_team_metrics_cache_for_team(r.team_id);
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


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


-- ====================================================
-- INDEXES
-- ====================================================

-- ====================================================
-- STEP 6 — INDEXES
-- ====================================================

CREATE INDEX IF NOT EXISTS idx_memberships_user_active ON public.memberships(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_memberships_team_role ON public.memberships(team_id, role);
CREATE INDEX IF NOT EXISTS idx_teams_status_visibility ON public.teams(status, visibility);
CREATE INDEX IF NOT EXISTS idx_invites_code ON public.invites(code);
CREATE INDEX IF NOT EXISTS idx_activities_team_created ON public.team_activities(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_actor_created ON public.team_activities(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_jobs_team ON public.export_jobs(team_id, status);
CREATE INDEX IF NOT EXISTS idx_agendas_team_dates ON public.team_agendas(team_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_resources_team ON public.team_resources(team_id);
CREATE INDEX IF NOT EXISTS idx_milestones_team_status ON public.team_milestones(team_id, status);
CREATE INDEX IF NOT EXISTS idx_challenges_team_status ON public.team_challenges(team_id, status);

CREATE INDEX IF NOT EXISTS idx_memberships_last_active ON public.memberships(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_memberships_team_active_time ON public.memberships(team_id, last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_jobs_status_created ON public.export_jobs(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_invites_code_expiry ON public.invites(code, expires_at);
CREATE INDEX IF NOT EXISTS idx_cleanup_logs_executed ON public.cleanup_logs(executed_at DESC);


-- ====================================================
-- STEP 7 — TRIGGERS
-- ====================================================

-- 1. Trigger to handle team creator membership initialization
DROP TRIGGER IF EXISTS on_team_created ON public.teams;
CREATE TRIGGER on_team_created
  AFTER INSERT ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_team_creation();

-- 2. Trigger to validate membership changes (hierarchy + owner safeguard)
DROP TRIGGER IF EXISTS enforce_membership_hierarchy_trigger ON public.memberships;
CREATE TRIGGER enforce_membership_hierarchy_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_membership_hierarchy();

-- 3. Trigger to validate team size limits (with transactional lock SELECT FOR UPDATE)
DROP TRIGGER IF EXISTS enforce_team_size_limit_trigger ON public.memberships;
CREATE TRIGGER enforce_team_size_limit_trigger
  BEFORE INSERT ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.check_team_size_limit();

-- 4. Triggers to validate team states during write events
DROP TRIGGER IF EXISTS enforce_team_state_memberships ON public.memberships;
CREATE TRIGGER enforce_team_state_memberships
  BEFORE INSERT OR UPDATE OR DELETE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_team_state_rules();

DROP TRIGGER IF EXISTS enforce_team_state_invites ON public.invites;
CREATE TRIGGER enforce_team_state_invites
  BEFORE INSERT OR UPDATE OR DELETE ON public.invites
  FOR EACH ROW EXECUTE FUNCTION public.enforce_team_state_rules();

DROP TRIGGER IF EXISTS enforce_team_state_resources ON public.team_resources;
CREATE TRIGGER enforce_team_state_resources
  BEFORE INSERT OR UPDATE OR DELETE ON public.team_resources
  FOR EACH ROW EXECUTE FUNCTION public.enforce_team_state_rules();

DROP TRIGGER IF EXISTS enforce_team_state_agendas ON public.team_agendas;
CREATE TRIGGER enforce_team_state_agendas
  BEFORE INSERT OR UPDATE OR DELETE ON public.team_agendas
  FOR EACH ROW EXECUTE FUNCTION public.enforce_team_state_rules();

DROP TRIGGER IF EXISTS enforce_team_state_challenges ON public.team_challenges;
CREATE TRIGGER enforce_team_state_challenges
  BEFORE INSERT OR UPDATE OR DELETE ON public.team_challenges
  FOR EACH ROW EXECUTE FUNCTION public.enforce_team_state_rules();

-- 5. Audit Log Triggers
DROP TRIGGER IF EXISTS audit_team_changes ON public.teams;
CREATE TRIGGER audit_team_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.log_team_audit();

DROP TRIGGER IF EXISTS audit_membership_changes ON public.memberships;
CREATE TRIGGER audit_membership_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.log_membership_audit();

-- 6. Metrics cache update triggers
DROP TRIGGER IF EXISTS refresh_cache_on_membership_change ON public.memberships;
CREATE TRIGGER refresh_cache_on_membership_change
  AFTER INSERT OR UPDATE OR DELETE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.refresh_team_metrics_cache();

DROP TRIGGER IF EXISTS refresh_cache_on_activity_change ON public.team_activities;
CREATE TRIGGER refresh_cache_on_activity_change
  AFTER INSERT OR UPDATE OR DELETE ON public.team_activities
  FOR EACH ROW EXECUTE FUNCTION public.refresh_team_metrics_cache();

-- 7. Trigger to sync metrics cache when users progress in roadmaps
DROP TRIGGER IF EXISTS on_progress_changed ON public.progress_tracking;
CREATE TRIGGER on_progress_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.progress_tracking
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_cache_on_progress_change();


-- ====================================================
-- RLS
-- ====================================================

-- ====================================================
-- STEP 8 — ROW LEVEL SECURITY ENABLEMENT
-- ====================================================

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_agendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleanup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_metrics_cache ENABLE ROW LEVEL SECURITY;


-- ====================================================
-- POLICIES
-- ====================================================

-- ====================================================
-- STEP 9 — ROW LEVEL SECURITY POLICIES
-- ====================================================

-- 1. Teams Table Policies
DROP POLICY IF EXISTS "View viewable teams" ON public.teams;
CREATE POLICY "View viewable teams" ON public.teams FOR SELECT USING (public.can_view_team(auth.uid(), id));

DROP POLICY IF EXISTS "Website admins or active users insert teams" ON public.teams;
DROP POLICY IF EXISTS "Website admins insert teams" ON public.teams;
CREATE POLICY "Website admins insert teams" ON public.teams FOR INSERT WITH CHECK (public.is_website_admin(auth.uid()));

DROP POLICY IF EXISTS "Manage team details" ON public.teams;
CREATE POLICY "Manage team details" ON public.teams FOR UPDATE USING (public.can_manage_team(auth.uid(), id)) WITH CHECK (public.can_manage_team(auth.uid(), id));

DROP POLICY IF EXISTS "Website admins delete teams" ON public.teams;
CREATE POLICY "Website admins delete teams" ON public.teams FOR DELETE USING (public.is_website_admin(auth.uid()));


-- 2. Memberships Table Policies
DROP POLICY IF EXISTS "View memberships of viewable teams" ON public.memberships;
CREATE POLICY "View memberships of viewable teams" ON public.memberships FOR SELECT USING (public.can_view_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Manage memberships" ON public.memberships;
CREATE POLICY "Manage memberships" ON public.memberships FOR ALL USING (public.can_manage_team(auth.uid(), team_id) OR user_id = auth.uid()) WITH CHECK (public.can_manage_team(auth.uid(), team_id) OR user_id = auth.uid());


-- 3. Invites Table Policies
DROP POLICY IF EXISTS "View invites of managed teams" ON public.invites;
CREATE POLICY "View invites of managed teams" ON public.invites FOR SELECT USING (public.can_view_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Manage invites" ON public.invites;
CREATE POLICY "Manage invites" ON public.invites FOR ALL USING (public.can_manage_team(auth.uid(), team_id)) WITH CHECK (public.can_manage_team(auth.uid(), team_id));


-- 4. Join Requests Table Policies
DROP POLICY IF EXISTS "View requests" ON public.join_requests;
CREATE POLICY "View requests" ON public.join_requests FOR SELECT USING (public.can_view_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Insert request" ON public.join_requests;
CREATE POLICY "Insert request" ON public.join_requests FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Manage requests" ON public.join_requests;
CREATE POLICY "Manage requests" ON public.join_requests FOR UPDATE USING (public.can_manage_team(auth.uid(), team_id)) WITH CHECK (public.can_manage_team(auth.uid(), team_id));


-- 5. Team Resources Table Policies
DROP POLICY IF EXISTS "View resources" ON public.team_resources;
CREATE POLICY "View resources" ON public.team_resources FOR SELECT USING (public.can_view_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Insert resources" ON public.team_resources;
CREATE POLICY "Insert resources" ON public.team_resources FOR INSERT WITH CHECK (public.get_team_role(auth.uid(), team_id) IN ('website_admin', 'team_admin', 'mentor'));

DROP POLICY IF EXISTS "Delete resources" ON public.team_resources;
CREATE POLICY "Delete resources" ON public.team_resources FOR DELETE USING (public.can_manage_team(auth.uid(), team_id) OR created_by = auth.uid());


-- 6. Team Agendas Table Policies
DROP POLICY IF EXISTS "View agendas" ON public.team_agendas;
CREATE POLICY "View agendas" ON public.team_agendas FOR SELECT USING (public.can_view_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Manage agendas" ON public.team_agendas;
CREATE POLICY "Manage agendas" ON public.team_agendas FOR ALL USING (public.can_manage_team(auth.uid(), team_id)) WITH CHECK (public.can_manage_team(auth.uid(), team_id));


-- 7. Team Challenges Table Policies
DROP POLICY IF EXISTS "View challenges" ON public.team_challenges;
CREATE POLICY "View challenges" ON public.team_challenges FOR SELECT USING (public.can_view_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Manage challenges" ON public.team_challenges;
CREATE POLICY "Manage challenges" ON public.team_challenges FOR ALL USING (public.can_manage_team(auth.uid(), team_id)) WITH CHECK (public.can_manage_team(auth.uid(), team_id));


-- 8. Team Milestones Table Policies
DROP POLICY IF EXISTS "View milestones" ON public.team_milestones;
CREATE POLICY "View milestones" ON public.team_milestones FOR SELECT USING (public.can_view_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Manage milestones" ON public.team_milestones;
CREATE POLICY "Manage milestones" ON public.team_milestones FOR ALL USING (public.can_manage_team(auth.uid(), team_id)) WITH CHECK (public.can_manage_team(auth.uid(), team_id));


-- 9. Team Badges Table Policies
DROP POLICY IF EXISTS "View badges" ON public.team_badges;
CREATE POLICY "View badges" ON public.team_badges FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manage badges" ON public.team_badges;
CREATE POLICY "Manage badges" ON public.team_badges FOR ALL USING (public.is_website_admin(auth.uid())) WITH CHECK (public.is_website_admin(auth.uid()));


-- 10. Team Activities Table Policies
DROP POLICY IF EXISTS "View activities" ON public.team_activities;
CREATE POLICY "View activities" ON public.team_activities FOR SELECT USING (public.can_view_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Insert activities" ON public.team_activities;
CREATE POLICY "Insert activities" ON public.team_activities FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);


-- 11. Export Jobs Table Policies
DROP POLICY IF EXISTS "View export jobs" ON public.export_jobs;
CREATE POLICY "View export jobs" ON public.export_jobs FOR SELECT USING (public.can_manage_team(auth.uid(), team_id) OR requested_by = auth.uid());

DROP POLICY IF EXISTS "Manage export jobs" ON public.export_jobs;
CREATE POLICY "Manage export jobs" ON public.export_jobs FOR ALL USING (requested_by = auth.uid()) WITH CHECK (requested_by = auth.uid());


-- 12. Export Logs Table Policies
DROP POLICY IF EXISTS "View logs" ON public.export_logs;
CREATE POLICY "View logs" ON public.export_logs FOR SELECT USING (public.can_manage_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Insert logs" ON public.export_logs;
CREATE POLICY "Insert logs" ON public.export_logs FOR INSERT WITH CHECK (user_id = auth.uid());


-- 13. Team Metrics Cache Table Policies
DROP POLICY IF EXISTS "View cache" ON public.team_metrics_cache;
CREATE POLICY "View cache" ON public.team_metrics_cache FOR SELECT USING (public.can_view_team(auth.uid(), team_id));


-- 14. Action Limits Table Policies
DROP POLICY IF EXISTS "Manage limits" ON public.action_limits;
CREATE POLICY "Manage limits" ON public.action_limits FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- 15. Cleanup Logs Table Policies
DROP POLICY IF EXISTS "View cleanup logs" ON public.cleanup_logs;
CREATE POLICY "View cleanup logs" ON public.cleanup_logs FOR SELECT USING (public.is_website_admin(auth.uid()));

DROP POLICY IF EXISTS "Insert cleanup logs" ON public.cleanup_logs;
CREATE POLICY "Insert cleanup logs" ON public.cleanup_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);


-- ====================================================
-- STEP 10 — SEED / INITIAL DATA
-- ====================================================

-- Placeholder for initial metadata seeding
-- Insert default team badges or configs here in the future
SELECT 1;

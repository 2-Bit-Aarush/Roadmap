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

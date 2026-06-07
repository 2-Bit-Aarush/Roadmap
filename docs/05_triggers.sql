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

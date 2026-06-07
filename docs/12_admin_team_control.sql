-- ====================================================
-- WEBSITE ADMIN TEAM CONTROL PANEL SQL MIGRATIONS
-- ====================================================

-- 1. Redefine can_view_team to allow viewing banned teams (so they remain visible but inactive)
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

  -- Banned teams remain visible to public or members (verified by application state for write actions)
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

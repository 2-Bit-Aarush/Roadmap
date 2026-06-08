-- Migration to add progress_visibility setting to teams.settings JSONB column
-- Default value is 'public_team'

-- 1. Update the default value constraint / column default on teams table
-- Since default is defined as a JSON string, let's update it:
ALTER TABLE public.teams 
ALTER COLUMN settings SET DEFAULT '{"progress_visibility": "public_team", "privacy": {"progress_visibility": "members", "history_visibility": "members", "leaderboard_visibility": "exact", "export_permissions": "team_admin"}, "membership": {"default_invite_expiry_hours": 24, "approval_mode": false, "max_invite_uses": null}, "admin": {"suspend_invites": false, "lock_editing": false, "freeze_activity": false}}'::jsonb;

-- 2. Update existing teams to have the default progress_visibility if not present
UPDATE public.teams
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{progress_visibility}',
  '"public_team"'::jsonb,
  true
)
WHERE settings->>'progress_visibility' IS NULL;

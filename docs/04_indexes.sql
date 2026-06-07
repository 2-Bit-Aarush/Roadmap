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

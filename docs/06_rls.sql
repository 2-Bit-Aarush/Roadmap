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

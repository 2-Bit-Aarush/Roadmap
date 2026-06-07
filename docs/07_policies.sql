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

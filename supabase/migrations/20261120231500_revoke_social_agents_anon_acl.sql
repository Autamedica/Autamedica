-- Lock down anonymous/public table ACLs on social_agent_investors and social_agent_jobs.
-- Complements 20261118062840_social_agents_investor_workspace.sql on main (extracted from #810).

revoke all on table public.social_agent_investors from anon, public;
revoke all on table public.social_agent_jobs from anon, public;

grant select, insert, update, delete on table public.social_agent_investors to authenticated;
grant select, insert, update, delete on table public.social_agent_jobs to authenticated;

revoke all on table public.social_agent_investors from anon, public;
revoke all on table public.social_agent_jobs from anon, public;

grant select, insert, update, delete on table public.social_agent_investors to authenticated;
grant select, insert, update, delete on table public.social_agent_jobs to authenticated;

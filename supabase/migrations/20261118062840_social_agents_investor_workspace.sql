-- Social Agents: investor CRM and durable job ledger.
create table if not exists public.social_agent_investors (
 id uuid primary key default gen_random_uuid(),
 owner_profile_id uuid not null references public.profiles(user_id) on delete cascade,
 organization_name text not null, contact_name text, role_title text, country_code text,
 thesis text, stage_focus text[] not null default '{}', ticket_range text,
 linkedin_url text, website_url text, source_url text,
 fit_score smallint not null default 0 check (fit_score between 0 and 100),
 priority text not null default 'C' check (priority in ('A','B','C')),
 status text not null default 'discovered' check (status in ('discovered','qualified','researching','ready_to_connect','invitation_sent','connected','replied','meeting','passed')),
 last_contacted_at timestamptz, next_follow_up_at timestamptz, notes text,
 provenance jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_profile_id, linkedin_url),
 unique(owner_profile_id, organization_name, contact_name)
);
create index if not exists social_agent_investors_owner_status_idx on public.social_agent_investors(owner_profile_id,status,priority);
create index if not exists social_agent_investors_follow_up_idx on public.social_agent_investors(owner_profile_id,next_follow_up_at) where next_follow_up_at is not null;

create table if not exists public.social_agent_jobs (
 id uuid primary key default gen_random_uuid(),
 owner_profile_id uuid not null references public.profiles(user_id) on delete cascade,
 agent text not null check (agent in ('linkedin_investors','whatsapp_operations')),
 action text not null,
 status text not null default 'queued' check (status in ('queued','running','succeeded','retryable_failure','terminal_failure','awaiting_approval')),
 idempotency_key text not null, input_metadata jsonb not null default '{}'::jsonb,
 result_metadata jsonb not null default '{}'::jsonb, policy_decision jsonb not null default '{}'::jsonb,
 attempt_count integer not null default 0 check (attempt_count >= 0),
 last_error_code text, started_at timestamptz, completed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(owner_profile_id,idempotency_key)
);
create index if not exists social_agent_jobs_owner_status_idx on public.social_agent_jobs(owner_profile_id,status,created_at desc);
alter table public.social_agent_investors enable row level security;
alter table public.social_agent_jobs enable row level security;
drop policy if exists "Owners manage their social agent investors" on public.social_agent_investors;
create policy "Owners manage their social agent investors" on public.social_agent_investors for all to authenticated using (owner_profile_id=auth.uid()) with check (owner_profile_id=auth.uid());
drop policy if exists "Owners manage their social agent jobs" on public.social_agent_jobs;
create policy "Owners manage their social agent jobs" on public.social_agent_jobs for all to authenticated using (owner_profile_id=auth.uid()) with check (owner_profile_id=auth.uid());
grant select,insert,update,delete on public.social_agent_investors to authenticated;
grant select,insert,update,delete on public.social_agent_jobs to authenticated;

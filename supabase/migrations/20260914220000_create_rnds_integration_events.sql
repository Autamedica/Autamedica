-- RNDS integration evidence table (DATASUS / RNDS)
-- SecureLog-safe: only sanitized payloads (no PII), source of request/response
-- for homologation and production audit.
create table if not exists public.rnds_integration_events (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain in ('cadsus', 'rac', 'repm', 'redfm')),
  direction text not null check (direction in ('request', 'response')),
  environment text not null check (environment in ('hom', 'prod', 'mock')),
  status text not null check (status in ('ok', 'pending', 'failed', 'skipped', 'offline_mock')),
  -- sanitized payload WITHOUT PII (no CNS, CPF, names, addresses)
  sanitized_payload jsonb not null default '{}'::jsonb,
  rnds_identifier text,
  reference_id text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rnds_integration_events_created_at_idx
  on public.rnds_integration_events (created_at desc);
create index if not exists rnds_integration_events_domain_idx
  on public.rnds_integration_events (domain, created_at desc);

-- Evidence is written by backend service role (edge functions, API server).
-- No direct user read access: audit only via admin cargos with service credentials.
alter table public.rnds_integration_events enable row level security;

-- Only service role can insert (api server / edge functions).
drop policy if exists "service_role_can_insert_rnds_events" on public.rnds_integration_events;
create policy "service_role_can_insert_rnds_events"
  on public.rnds_integration_events
  to service_role
  for insert
  with check (true);

-- No public/authenticated read: keep audit surface minimal.
-- Admin dashboard reads via a dedicated RPC with service role.
drop policy if exists "authenticated_cannot_read_rnds_events" on public.rnds_integration_events;
create policy "authenticated_cannot_read_rnds_events"
  on public.rnds_integration_events
  for select
  using (false);
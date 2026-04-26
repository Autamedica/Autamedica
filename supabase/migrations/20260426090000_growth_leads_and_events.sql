-- Growth lead capture and first-party funnel events.
-- Service-role only. Public writes go through /api/growth-leads.

create table if not exists growth_os.leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_normalized text generated always as (lower(btrim(email))) stored,
  name text,
  phone text,
  vertical text not null default 'general',
  intent text not null default 'newsletter',
  form_id text not null default 'newsletter',
  status text not null default 'new' check (status in (
    'new',
    'nurturing',
    'qualified',
    'booked',
    'paid',
    'lost',
    'unsubscribed'
  )),
  consent_marketing boolean not null default false,
  consent_source text,
  page_url text,
  referrer text,
  first_utm_source text,
  first_utm_medium text,
  first_utm_campaign text,
  first_utm_content text,
  first_utm_term text,
  attribution jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_growth_leads_email_form_vertical
  on growth_os.leads (email_normalized, form_id, vertical);

create index if not exists idx_growth_leads_status_created
  on growth_os.leads (status, created_at desc);

create index if not exists idx_growth_leads_source_campaign
  on growth_os.leads (first_utm_source, first_utm_campaign, created_at desc);

create table if not exists growth_os.growth_events (
  id bigserial primary key,
  event_type text not null,
  lead_id uuid references growth_os.leads(id) on delete set null,
  anonymous_id text,
  session_id text,
  vertical text,
  page_url text,
  referrer text,
  attribution jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_growth_events_type_occurred
  on growth_os.growth_events (event_type, occurred_at desc);

create index if not exists idx_growth_events_lead
  on growth_os.growth_events (lead_id, occurred_at desc);

alter table growth_os.leads enable row level security;
alter table growth_os.growth_events enable row level security;

drop policy if exists service_role_all on growth_os.leads;
create policy service_role_all on growth_os.leads
  for all to service_role using (true) with check (true);

drop policy if exists service_role_all on growth_os.growth_events;
create policy service_role_all on growth_os.growth_events
  for all to service_role using (true) with check (true);

grant all on table growth_os.leads to service_role;
grant all on table growth_os.growth_events to service_role;
grant all on sequence growth_os.growth_events_id_seq to service_role;

create or replace function growth_os.touch_leads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_leads_updated_at on growth_os.leads;
create trigger trg_touch_leads_updated_at
  before update on growth_os.leads
  for each row
  execute function growth_os.touch_leads_updated_at();

comment on table growth_os.leads is
  'Leads capturados por formularios publicos con atribucion UTM y consentimiento.';

comment on table growth_os.growth_events is
  'Eventos first-party del funnel de growth. El primer evento operativo es lead_created.';

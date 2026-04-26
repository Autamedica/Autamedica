create table if not exists growth_os.newsletter_editions (
  id uuid primary key default gen_random_uuid(),
  edition_date date not null unique,
  subject text not null,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'sending', 'sent', 'failed', 'skipped')),
  html text not null,
  candidates jsonb not null default '[]'::jsonb,
  summaries jsonb not null default '[]'::jsonb,
  provider text,
  provider_message_id text,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_growth_newsletter_editions_status
  on growth_os.newsletter_editions (status, created_at desc);

create index if not exists idx_growth_newsletter_editions_created_at
  on growth_os.newsletter_editions (created_at desc);

alter table growth_os.newsletter_editions enable row level security;

drop policy if exists service_role_all on growth_os.newsletter_editions;
create policy service_role_all on growth_os.newsletter_editions
  for all to service_role using (true) with check (true);

grant all on table growth_os.newsletter_editions to service_role;

create or replace function growth_os.touch_newsletter_editions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_newsletter_editions_updated_at on growth_os.newsletter_editions;
create trigger trg_touch_newsletter_editions_updated_at
  before update on growth_os.newsletter_editions
  for each row
  execute function growth_os.touch_newsletter_editions_updated_at();

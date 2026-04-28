create table if not exists growth_os.ad_spend (
  id             uuid primary key default gen_random_uuid(),
  spend_date     date not null,
  source         text not null,
  medium         text,
  campaign       text,
  content        text,
  vertical       text,
  amount         numeric(14,2) not null check (amount >= 0),
  currency       text not null default 'ARS',
  provider       text,
  external_id    text,
  notes          text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_growth_ad_spend_date_source
  on growth_os.ad_spend (spend_date desc, source);

create index if not exists idx_growth_ad_spend_campaign
  on growth_os.ad_spend (source, campaign, spend_date desc);

create unique index if not exists idx_growth_ad_spend_dedupe
  on growth_os.ad_spend (
    spend_date,
    source,
    coalesce(campaign, ''),
    coalesce(content, ''),
    coalesce(provider, ''),
    coalesce(external_id, '')
  );

alter table growth_os.ad_spend enable row level security;

drop policy if exists service_role_all on growth_os.ad_spend;
create policy service_role_all on growth_os.ad_spend
  for all to service_role using (true) with check (true);

grant all on table growth_os.ad_spend to service_role;

create or replace function growth_os.touch_ad_spend_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_ad_spend_updated_at on growth_os.ad_spend;
create trigger trg_touch_ad_spend_updated_at
  before update on growth_os.ad_spend
  for each row
  execute function growth_os.touch_ad_spend_updated_at();

comment on table growth_os.ad_spend is
  'Gasto real de adquisicion por canal/campania para calcular CAC, ROAS y margen sin mocks.';

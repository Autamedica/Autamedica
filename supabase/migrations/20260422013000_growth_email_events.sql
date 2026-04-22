-- Email observability: Resend/Brevo/BillionMail events.
-- Service-role only. Used by webhooks and internal monitoring.

create table if not exists growth_os.email_events (
  id                 bigserial primary key,
  provider           text not null check (provider in ('resend', 'brevo', 'billionmail')),
  provider_event_id  text,
  event_type         text not null,
  message_id         text,
  broadcast_id       text,
  campaign_id        text,
  subject            text,
  from_email         text,
  recipient_email    text,
  recipient_emails   jsonb not null default '[]'::jsonb,
  tags               jsonb not null default '{}'::jsonb,
  occurred_at        timestamptz,
  payload            jsonb not null,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz,
  processing_error   text
);

create unique index if not exists idx_growth_email_events_provider_event_id
  on growth_os.email_events (provider, provider_event_id)
  where provider_event_id is not null;

create index if not exists idx_growth_email_events_recipient_received
  on growth_os.email_events (recipient_email, received_at desc);

create index if not exists idx_growth_email_events_event_received
  on growth_os.email_events (provider, event_type, received_at desc);

create index if not exists idx_growth_email_events_message_id
  on growth_os.email_events (provider, message_id)
  where message_id is not null;

create index if not exists idx_growth_email_events_broadcast_id
  on growth_os.email_events (provider, broadcast_id)
  where broadcast_id is not null;

alter table growth_os.email_events enable row level security;

drop policy if exists service_role_all on growth_os.email_events;
create policy service_role_all on growth_os.email_events
  for all to service_role using (true) with check (true);

grant all on table growth_os.email_events to service_role;
grant all on sequence growth_os.email_events_id_seq to service_role;

comment on table growth_os.email_events is
  'Eventos normalizados de email recibidos por webhook o importados desde proveedores.';


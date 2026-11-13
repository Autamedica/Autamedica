-- Centralize live operational authority in public.platform_operational_switches.
-- Growth workers must read this row immediately before outbound delivery.
alter table public.platform_operational_switches
  add column if not exists whatsapp_send_enabled boolean not null default false,
  add column if not exists email_send_enabled boolean not null default false,
  add column if not exists dry_run_enabled boolean not null default true;

comment on column public.platform_operational_switches.whatsapp_send_enabled is
  'Admin authority for all outbound WhatsApp delivery flows.';
comment on column public.platform_operational_switches.email_send_enabled is
  'Admin authority for all outbound email delivery flows.';
comment on column public.platform_operational_switches.dry_run_enabled is
  'When true, outbound-capable workers simulate delivery and never call external providers.';

-- Keep the historic growth tables readable for audit, but make their values non-authoritative.
-- The application and workers must consult this row for all active/inactive decisions.

alter table public.platform_operational_switches
  add column if not exists switch_audit jsonb not null default '{}'::jsonb;

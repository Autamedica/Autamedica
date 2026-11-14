-- Centralize live operational authority in public.platform_operational_switches.
-- Growth workers must read this row immediately before outbound delivery.
alter table public.platform_operational_switches
  add column if not exists whatsapp_send_enabled boolean not null default false,
  add column if not exists email_send_enabled boolean not null default false,
  add column if not exists dry_run_enabled boolean not null default true;

-- Preserve the effective production permissions from both legacy Growth gates.
-- A channel is enabled only when its agent capability AND channel killswitch are enabled.
do $
begin
  if to_regclass('growth_os.agent_capabilities') is not null
     and to_regclass('growth_os.killswitch_state') is not null then
    execute $backfill$
      update public.platform_operational_switches s
      set whatsapp_send_enabled = coalesce((
            select bool_and(c.enabled and coalesce(k.enabled, false))
            from growth_os.agent_capabilities c
            left join growth_os.killswitch_state k on k.channel = c.channel
            where c.agent_type = 'concierge'
              and c.capability = 'send_whatsapp'
          ), false),
          email_send_enabled = coalesce((
            select bool_and(c.enabled and coalesce(k.enabled, false))
            from growth_os.agent_capabilities c
            left join growth_os.killswitch_state k on k.channel = c.channel
            where c.agent_type = 'concierge'
              and c.capability = 'enqueue_email'
          ), false),
          dry_run_enabled = coalesce((
            select bool_and(c.enabled)
            from growth_os.agent_capabilities c
            where c.agent_type = 'concierge'
              and c.capability = 'dry_run_outbound'
          ), true)
      where s.id = 'global';
    $backfill$;
  end if;
end
$;

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

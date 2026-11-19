-- Live payment controls and human approval inbox.
create table if not exists public.platform_operational_switches (
  id text primary key default 'global' check (id = 'global'),
  jordan_qr_payments_enabled boolean not null default true,
  pharmacy_express_payments_enabled boolean not null default true,
  global_pix_mp_payments_enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  reason text
);
insert into public.platform_operational_switches (id) values ('global') on conflict (id) do nothing;
create or replace function public.set_platform_operational_switches_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists platform_operational_switches_updated_at on public.platform_operational_switches;
create trigger platform_operational_switches_updated_at before update on public.platform_operational_switches
for each row execute function public.set_platform_operational_switches_updated_at();
alter table public.platform_operational_switches enable row level security;
drop policy if exists platform_operational_switches_admin_all on public.platform_operational_switches;
create policy platform_operational_switches_admin_all on public.platform_operational_switches
for all to authenticated
using ((coalesce(auth.jwt()->>'role','') = 'admin' or coalesce(auth.jwt()->'app_metadata'->>'role','') = 'admin' or coalesce(auth.jwt()->'user_metadata'->>'role','') = 'admin'))
with check ((coalesce(auth.jwt()->>'role','') = 'admin' or coalesce(auth.jwt()->'app_metadata'->>'role','') = 'admin' or coalesce(auth.jwt()->'user_metadata'->>'role','') = 'admin'));
grant select, insert, update on public.platform_operational_switches to authenticated;
grant all on public.platform_operational_switches to service_role;

create table if not exists public.admin_approval_decisions (
 id uuid primary key default gen_random_uuid(),
 status text not null default 'PENDING_HUMAN_APPROVAL'
   check (status in ('PENDING_HUMAN_APPROVAL','APPROVED','REJECTED')),
 domain text not null check (domain in ('money','operations','clinical','infra','data','comms')),
 proposed_by text not null,
 summary text not null,
 risk_reason text not null,
 impact_scope text not null,
 payload jsonb not null default '{}'::jsonb,
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz,
 review_notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists admin_approval_decisions_status_created_idx
 on public.admin_approval_decisions(status,created_at desc);
alter table public.admin_approval_decisions enable row level security;
drop policy if exists admin_approval_decisions_admin_all on public.admin_approval_decisions;
create policy admin_approval_decisions_admin_all on public.admin_approval_decisions
for all to authenticated
using ((coalesce(auth.jwt()->>'role','') = 'admin' or coalesce(auth.jwt()->'app_metadata'->>'role','') = 'admin' or coalesce(auth.jwt()->'user_metadata'->>'role','') = 'admin'))
with check ((coalesce(auth.jwt()->>'role','') = 'admin' or coalesce(auth.jwt()->'app_metadata'->>'role','') = 'admin' or coalesce(auth.jwt()->'user_metadata'->>'role','') = 'admin'));
grant select, insert, update on public.admin_approval_decisions to authenticated;
grant all on public.admin_approval_decisions to service_role;

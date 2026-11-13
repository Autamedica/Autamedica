-- Partner attribution core: opaque first-party QR token -> authenticated patient.
-- No medical records or personal identifiers are logged on a QR scan.
create table if not exists public.partner_qr_visits (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  partner_code text not null check (partner_code ~ '^[a-z0-9_]{2,60}$'),
  location_code text not null check (location_code ~ '^[A-Z0-9]{4,32}$'),
  country_code text not null default 'BR' check (country_code in ('BR','AR')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz
);
create index if not exists partner_qr_visits_location_created_idx
  on public.partner_qr_visits(location_code,created_at desc);
create index if not exists partner_qr_visits_expiry_idx
  on public.partner_qr_visits(expires_at);

create table if not exists public.partner_attributions (
  patient_user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique references public.partner_qr_visits(token_hash),
  partner_code text not null,
  location_code text not null,
  country_code text not null check (country_code in ('BR','AR')),
  attribution_source text not null check (attribution_source in ('play_install_referrer','app_link')),
  attributed_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists partner_attributions_partner_idx
  on public.partner_attributions(partner_code,location_code,attributed_at desc);

alter table public.partner_qr_visits enable row level security;
alter table public.partner_attributions enable row level security;
revoke all on public.partner_qr_visits from public, anon, authenticated;
revoke all on public.partner_attributions from public, anon, authenticated;
grant select,insert,update on public.partner_qr_visits to service_role;
grant select,insert,update on public.partner_attributions to service_role;

-- Invoked ONLY by a trusted server after auth.getUser(access_token) verifies identity.
-- SQL claims atomically; first-attribution and unique token prevent replay.
create or replace function public.claim_partner_attribution(
  p_token_hash text,
  p_patient_user_id uuid,
  p_source text
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_visit public.partner_qr_visits%rowtype;
  v_rows integer := 0;
begin
  if p_source not in ('play_install_referrer','app_link')
     or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_patient_user_id is null then
    return false;
  end if;

  -- Restrict attribution to authenticated patient accounts; reject doctor/admin roles.
  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_patient_user_id and p.role::text = 'patient'
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.partner_attributions
    where patient_user_id = p_patient_user_id
  ) then
    return true; -- First touch cannot be replaced by later scans.
  end if;

  update public.partner_qr_visits v
     set claimed_by = p_patient_user_id, claimed_at = now()
   where v.token_hash = p_token_hash
     and v.claimed_by is null
     and v.expires_at > now()
  returning v.* into v_visit;

  if not found then return false; end if;

  insert into public.partner_attributions
    (patient_user_id, token_hash, partner_code, location_code, country_code,
     attribution_source, expires_at)
  values (p_patient_user_id, p_token_hash, v_visit.partner_code,
          v_visit.location_code, v_visit.country_code, p_source, v_visit.expires_at)
  on conflict (patient_user_id) do nothing;

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.claim_partner_attribution(text,uuid,text) from public, anon, authenticated;
grant execute on function public.claim_partner_attribution(text,uuid,text) to service_role;

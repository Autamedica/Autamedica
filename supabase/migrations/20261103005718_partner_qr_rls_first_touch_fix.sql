-- Explicit service-only RLS policies; client roles have no table privileges.
drop policy if exists partner_qr_visits_service_only on public.partner_qr_visits;
create policy partner_qr_visits_service_only on public.partner_qr_visits
  for all to service_role using (true) with check (true);

drop policy if exists partner_attributions_service_only on public.partner_attributions;
create policy partner_attributions_service_only on public.partner_attributions
  for all to service_role using (true) with check (true);

-- Idempotent replay of the same token is allowed, but later tokens
-- can never replace or report success for an earlier first-touch attribution.
create or replace function public.claim_partner_attribution(
  p_token_hash text, p_patient_user_id uuid, p_source text
) returns boolean
language plpgsql security invoker set search_path = ''
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

  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_patient_user_id and p.role::text = 'patient'
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.partner_attributions a
    where a.patient_user_id = p_patient_user_id
      and a.token_hash = p_token_hash
  ) then
    return true;
  end if;

  if exists (
    select 1 from public.partner_attributions a
    where a.patient_user_id = p_patient_user_id
  ) then
    return false;
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
  values (p_patient_user_id, p_token_hash, v_visit.partner_code, v_visit.location_code,
          v_visit.country_code, p_source, v_visit.expires_at)
  on conflict (patient_user_id) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.claim_partner_attribution(text,uuid,text) from public, anon, authenticated;
grant execute on function public.claim_partner_attribution(text,uuid,text) to service_role;

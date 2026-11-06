-- Transactional, idempotent ingestion of already-verified Meta webhook events.
-- SECURITY INVOKER + revoked execute: only the trusted service role can call this.
create or replace function public.record_b2c_whatsapp_event(
  p_phone_e164 text,
  p_event_type text,
  p_provider_message_id text
)
returns boolean
language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare
  v_contact_id uuid;
  v_count integer;
  v_event_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_phone_e164 is null or p_phone_e164 !~ '^\+54[0-9]{10,11}$'
     or p_provider_message_id is null or length(p_provider_message_id) not between 1 and 255
     or p_event_type not in ('inbound_message','inbound_opt_out','app_echo','delivered','read') then
    return false;
  end if;
  select count(*), min(id::text)::uuid into v_count,v_contact_id
    from public.b2c_whatsapp_contacts where country_code='AR' and phone_e164=p_phone_e164;
  if v_count <> 1 then return false; end if;

  insert into public.b2c_whatsapp_events
    (contact_id,event_type,origin,provider_message_id,occurred_at)
  values (v_contact_id,p_event_type,'meta_webhook',p_provider_message_id,v_now)
  on conflict do nothing
  returning id into v_event_id;
  if v_event_id is null then return false; end if;

  if p_event_type='inbound_opt_out' then
    update public.b2c_whatsapp_contacts set
      consent_status='withdrawn', contact_status='do_not_contact',
      exclusion_reason='Baja explícita por WhatsApp',
      last_inbound_at=v_now, updated_at=v_now
    where id=v_contact_id;
  elsif p_event_type='inbound_message' then
    update public.b2c_whatsapp_contacts set
      contact_status=case
        when contact_status in ('do_not_contact','interested') then contact_status
        else 'replied'
      end, last_inbound_at=v_now, updated_at=v_now
    where id=v_contact_id;
  elsif p_event_type='app_echo' then
    update public.b2c_whatsapp_contacts set last_outbound_at=v_now, updated_at=v_now
    where id=v_contact_id;
  end if;
  return true;
end;
$$;
revoke all on function public.record_b2c_whatsapp_event(text,text,text) from public,anon,authenticated;
grant execute on function public.record_b2c_whatsapp_event(text,text,text) to service_role;

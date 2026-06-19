-- Deliver completed prescriptions to patients through a durable WhatsApp outbox.

create table if not exists growth_os.patient_whatsapp_jobs (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_phone text not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  provider_message_id text,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_patient_whatsapp_jobs_due
  on growth_os.patient_whatsapp_jobs (status, scheduled_for)
  where status = 'pending';

alter table growth_os.patient_whatsapp_jobs enable row level security;

drop policy if exists service_role_all_patient_whatsapp_jobs on growth_os.patient_whatsapp_jobs;
create policy service_role_all_patient_whatsapp_jobs on growth_os.patient_whatsapp_jobs
  for all to service_role using (true) with check (true);

grant all on table growth_os.patient_whatsapp_jobs to service_role;

create or replace function growth_os.touch_patient_whatsapp_jobs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_patient_whatsapp_jobs_updated_at on growth_os.patient_whatsapp_jobs;
create trigger trg_touch_patient_whatsapp_jobs_updated_at
  before update on growth_os.patient_whatsapp_jobs
  for each row execute function growth_os.touch_patient_whatsapp_jobs_updated_at();

create or replace function growth_os.enqueue_patient_prescription_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = growth_os, public
as $$
declare
  v_patient_profile record;
  v_phone text;
begin
  if new.status <> 'sent'
     or nullif(btrim(new.cuir), '') is null
     or nullif(btrim(new.signed_pdf_url), '') is null then
    return new;
  end if;

  select pr.user_id, nullif(btrim(pr.first_name), '') as first_name, pr.phone
    into v_patient_profile
  from public.patients p
  join public.profiles pr on pr.user_id = p.user_id
  where p.id = new.patient_id
  limit 1;

  v_phone := growth_os.normalize_notification_contact('whatsapp', v_patient_profile.phone);
  if nullif(v_phone, '') is null
     or growth_os.is_notification_contact_suppressed('whatsapp', v_phone) then
    return new;
  end if;

  insert into growth_os.patient_whatsapp_jobs (
    prescription_id, patient_id, user_id, recipient_phone, message, dedupe_key
  ) values (
    new.id,
    new.patient_id,
    v_patient_profile.user_id,
    v_phone,
    'AutaMedica - receta digital disponible' || chr(10) || chr(10) ||
      'Hola ' || coalesce(v_patient_profile.first_name, 'Paciente') || '. Tu receta ya fue emitida.' || chr(10) ||
      'Descargar PDF: ' || new.signed_pdf_url || chr(10) ||
      'Verificar receta: https://www.autamedica.com/verify/' || new.cuir,
    'patient_whatsapp:prescription_ready:' || new.id::text
  )
  on conflict (dedupe_key) do update set
    recipient_phone = excluded.recipient_phone,
    message = excluded.message,
    status = case when growth_os.patient_whatsapp_jobs.status = 'sent' then 'sent' else 'pending' end,
    attempts = case when growth_os.patient_whatsapp_jobs.status = 'sent' then growth_os.patient_whatsapp_jobs.attempts else 0 end,
    scheduled_for = case when growth_os.patient_whatsapp_jobs.status = 'sent' then growth_os.patient_whatsapp_jobs.scheduled_for else now() end,
    last_error = case when growth_os.patient_whatsapp_jobs.status = 'sent' then growth_os.patient_whatsapp_jobs.last_error else null end;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_patient_prescription_whatsapp_update on public.prescriptions;
create trigger trg_enqueue_patient_prescription_whatsapp_update
  after update of status, cuir, signed_pdf_url on public.prescriptions
  for each row
  when (
    new.status = 'sent' and new.cuir is not null and new.signed_pdf_url is not null
    and (old.status is distinct from new.status or old.cuir is distinct from new.cuir or old.signed_pdf_url is distinct from new.signed_pdf_url)
  )
  execute function growth_os.enqueue_patient_prescription_whatsapp();

drop trigger if exists trg_enqueue_patient_prescription_whatsapp_insert on public.prescriptions;
create trigger trg_enqueue_patient_prescription_whatsapp_insert
  after insert on public.prescriptions
  for each row
  when (new.status = 'sent' and new.cuir is not null and new.signed_pdf_url is not null)
  execute function growth_os.enqueue_patient_prescription_whatsapp();

-- Recover completed prescriptions that never entered the WhatsApp outbox.
insert into growth_os.patient_whatsapp_jobs (
  prescription_id, patient_id, user_id, recipient_phone, message, dedupe_key
)
select
  rx.id,
  rx.patient_id,
  pr.user_id,
  growth_os.normalize_notification_contact('whatsapp', pr.phone),
  'AutaMedica - receta digital disponible' || chr(10) || chr(10) ||
    'Hola ' || coalesce(nullif(btrim(pr.first_name), ''), 'Paciente') || '. Tu receta ya fue emitida.' || chr(10) ||
    'Descargar PDF: ' || rx.signed_pdf_url || chr(10) ||
    'Verificar receta: https://www.autamedica.com/verify/' || rx.cuir,
  'patient_whatsapp:prescription_ready:' || rx.id::text
from public.prescriptions rx
join public.patients p on p.id = rx.patient_id
join public.profiles pr on pr.user_id = p.user_id
where rx.status = 'sent'
  and nullif(btrim(rx.cuir), '') is not null
  and nullif(btrim(rx.signed_pdf_url), '') is not null
  and nullif(growth_os.normalize_notification_contact('whatsapp', pr.phone), '') is not null
  and not growth_os.is_notification_contact_suppressed('whatsapp', pr.phone)
on conflict (dedupe_key) do nothing;

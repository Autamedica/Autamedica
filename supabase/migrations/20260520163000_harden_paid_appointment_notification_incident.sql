-- Incident 2026-05-20 hardening:
-- - Paid/confirmed appointments must be visible as notification-risk rows when any channel is missing.
-- - Doctor notification trigger must also cover appointments inserted directly as confirmed.
-- - Known dead/suppressed email inboxes must not receive critical appointment jobs.

create table if not exists growth_os.suppressed_notification_contacts (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'whatsapp')),
  contact_value text not null,
  reason text not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (channel, contact_value)
);

alter table growth_os.suppressed_notification_contacts enable row level security;

drop policy if exists service_role_all_suppressed_notification_contacts
  on growth_os.suppressed_notification_contacts;
create policy service_role_all_suppressed_notification_contacts
  on growth_os.suppressed_notification_contacts
  for all to service_role
  using (true)
  with check (true);

grant all on table growth_os.suppressed_notification_contacts to service_role;

create or replace function growth_os.normalize_notification_contact(
  contact_channel text,
  contact_value text
)
returns text
language sql
immutable
as $$
  select case
    when contact_channel = 'email' then lower(btrim(coalesce(contact_value, '')))
    when contact_channel = 'whatsapp' then regexp_replace(coalesce(contact_value, ''), '[^0-9]', '', 'g')
    else btrim(coalesce(contact_value, ''))
  end;
$$;

create or replace function growth_os.is_notification_contact_suppressed(
  contact_channel text,
  contact_value text
)
returns boolean
language sql
stable
security definer
set search_path = growth_os, public
as $$
  select exists (
    select 1
    from growth_os.suppressed_notification_contacts c
    where c.channel = contact_channel
      and c.contact_value = growth_os.normalize_notification_contact(contact_channel, contact_value)
  );
$$;

create or replace function growth_os.normalize_suppressed_notification_contact()
returns trigger
language plpgsql
as $$
begin
  new.contact_value := growth_os.normalize_notification_contact(new.channel, new.contact_value);
  return new;
end;
$$;

drop trigger if exists trg_normalize_suppressed_notification_contact
  on growth_os.suppressed_notification_contacts;
create trigger trg_normalize_suppressed_notification_contact
  before insert or update of channel, contact_value on growth_os.suppressed_notification_contacts
  for each row
  execute function growth_os.normalize_suppressed_notification_contact();

create index if not exists idx_suppressed_notification_contacts_lookup
  on growth_os.suppressed_notification_contacts (channel, contact_value);

create or replace function growth_os.enqueue_doctor_confirmed_appointment()
returns trigger
language plpgsql
security definer
set search_path = growth_os, public
as $$
declare
  v_doctor_profile record;
  v_patient_profile record;
  v_start text;
  v_patient_name text;
  v_whatsapp_message text;
  v_doctor_email text;
  v_doctor_phone text;
begin
  if new.doctor_id is null or new.patient_id is null or new.start_time is null then
    return new;
  end if;

  if new.status <> 'confirmed' then
    return new;
  end if;

  if tg_op = 'UPDATE' and coalesce(old.status, '') = 'confirmed' then
    return new;
  end if;

  select
    pr.user_id,
    lower(pr.email) as email,
    nullif(btrim(coalesce(pr.first_name, '')), '') as first_name,
    nullif(btrim(coalesce(pr.phone, '')), '') as phone
  into v_doctor_profile
  from public.doctors d
  join public.profiles pr on pr.user_id = d.user_id
  where d.id = new.doctor_id
  limit 1;

  if v_doctor_profile.user_id is null then
    return new;
  end if;

  v_doctor_email := growth_os.normalize_notification_contact('email', v_doctor_profile.email);
  v_doctor_phone := growth_os.normalize_notification_contact('whatsapp', v_doctor_profile.phone);

  select nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), '') as full_name
  into v_patient_profile
  from public.patients p
  join public.profiles pr on pr.user_id = p.user_id
  where p.id = new.patient_id
  limit 1;

  v_start := to_char(new.start_time at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI');
  v_patient_name := coalesce(v_patient_profile.full_name, 'Un paciente');
  v_whatsapp_message := 'Nueva consulta pagada en AutaMedica.' || chr(10) ||
    'Paciente: ' || v_patient_name || chr(10) ||
    'Horario: ' || v_start || chr(10) ||
    'Abrir agenda: https://doctor.autamedica.com/doctors/appointments';

  if v_doctor_email <> ''
     and growth_os.is_notification_contact_suppressed('email', v_doctor_email) is false then
    insert into growth_os.email_jobs (
      job_type,
      recipient_email,
      recipient_name,
      user_id,
      appointment_id,
      dedupe_key,
      template_data
    )
    values (
      'doctor_new_appointment',
      v_doctor_email,
      v_doctor_profile.first_name,
      v_doctor_profile.user_id,
      new.id,
      'doctor_new_appointment:' || new.id::text,
      jsonb_build_object(
        'appointment_time', v_start,
        'patient_name', v_patient_name,
        'action_url', 'https://doctor.autamedica.com/doctors/appointments'
      )
    )
    on conflict (dedupe_key) do nothing;
  end if;

  insert into public.portal_notifications (
    user_id,
    audience,
    category,
    type,
    title,
    body,
    action_url,
    action_label,
    priority,
    dedupe_key,
    context_data
  )
  values (
    v_doctor_profile.user_id,
    'doctor',
    'appointment',
    'event_appointment_payment_confirmed',
    'Consulta pagada y confirmada',
    v_patient_name || ' confirmo el pago para ' || v_start || '.',
    '/doctors/appointments',
    'Ver consulta',
    'urgent',
    'event:appointment.payment_confirmed:' || new.id::text,
    jsonb_build_object(
      'appointmentId', new.id,
      'doctorId', new.doctor_id,
      'patientId', new.patient_id,
      'startTime', new.start_time
    )
  )
  on conflict (user_id, dedupe_key) do nothing;

  if v_doctor_phone <> ''
     and growth_os.is_notification_contact_suppressed('whatsapp', v_doctor_phone) is false then
    insert into growth_os.doctor_whatsapp_jobs (
      appointment_id,
      doctor_id,
      user_id,
      recipient_phone,
      message,
      dedupe_key
    )
    values (
      new.id,
      new.doctor_id,
      v_doctor_profile.user_id,
      v_doctor_phone,
      v_whatsapp_message,
      'doctor_whatsapp:appointment_confirmed:' || new.id::text
    )
    on conflict (dedupe_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_doctor_confirmed_appointment_insert on public.appointments;
create trigger trg_enqueue_doctor_confirmed_appointment_insert
  after insert on public.appointments
  for each row
  when (new.status = 'confirmed')
  execute function growth_os.enqueue_doctor_confirmed_appointment();

drop trigger if exists trg_enqueue_doctor_confirmed_appointment on public.appointments;
create trigger trg_enqueue_doctor_confirmed_appointment
  after update of status on public.appointments
  for each row
  when (new.status = 'confirmed' and old.status is distinct from 'confirmed')
  execute function growth_os.enqueue_doctor_confirmed_appointment();

create or replace view growth_os.appointment_notification_risks as
select
  a.id as appointment_id,
  a.status,
  a.start_time,
  a.doctor_id,
  a.patient_id,
  dp.user_id as doctor_user_id,
  pp.user_id as patient_user_id,
  growth_os.normalize_notification_contact('email', dpr.email) as doctor_email,
  growth_os.normalize_notification_contact('whatsapp', dpr.phone) as doctor_phone,
  growth_os.normalize_notification_contact('whatsapp', ppr.phone) as patient_phone,
  exists (
    select 1
    from growth_os.email_jobs ej
    where ej.appointment_id = a.id
      and ej.job_type = 'doctor_new_appointment'
      and ej.status in ('pending', 'processing', 'sent')
  ) as doctor_email_enqueued,
  exists (
    select 1
    from public.portal_notifications pn
    where pn.user_id = dp.user_id
      and pn.dedupe_key = 'event:appointment.payment_confirmed:' || a.id::text
  ) as doctor_portal_notification_enqueued,
  exists (
    select 1
    from growth_os.doctor_whatsapp_jobs dwj
    where dwj.appointment_id = a.id
      and dwj.status in ('pending', 'sent')
  ) as doctor_whatsapp_enqueued,
  exists (
    select 1
    from public.appointment_reminders ar
    where ar.appointment_id = a.id
      and ar.channel = 'whatsapp'
      and ar.status in ('pending', 'sent')
  ) as patient_whatsapp_reminder_enqueued,
  array_remove(array[
    case when coalesce(growth_os.normalize_notification_contact('email', dpr.email), '') = '' then 'doctor_email_missing' end,
    case when growth_os.is_notification_contact_suppressed('email', dpr.email) then 'doctor_email_suppressed' end,
    case when coalesce(growth_os.normalize_notification_contact('email', dpr.email), '') <> ''
      and growth_os.is_notification_contact_suppressed('email', dpr.email) is false
      and not exists (
        select 1 from growth_os.email_jobs ej
        where ej.appointment_id = a.id
          and ej.job_type = 'doctor_new_appointment'
          and ej.status in ('pending', 'processing', 'sent')
      ) then 'doctor_email_job_missing' end,
    case when coalesce(growth_os.normalize_notification_contact('whatsapp', dpr.phone), '') = '' then 'doctor_whatsapp_missing' end,
    case when growth_os.is_notification_contact_suppressed('whatsapp', dpr.phone) then 'doctor_whatsapp_suppressed' end,
    case when coalesce(growth_os.normalize_notification_contact('whatsapp', ppr.phone), '') = '' then 'patient_whatsapp_missing' end,
    case when not exists (
      select 1 from public.portal_notifications pn
      where pn.user_id = dp.user_id
        and pn.dedupe_key = 'event:appointment.payment_confirmed:' || a.id::text
    ) then 'doctor_portal_notification_missing' end,
    case when not exists (
      select 1 from growth_os.doctor_whatsapp_jobs dwj
      where dwj.appointment_id = a.id
        and dwj.status in ('pending', 'sent')
    ) then 'doctor_whatsapp_job_missing' end,
    case when not exists (
      select 1 from public.appointment_reminders ar
      where ar.appointment_id = a.id
        and ar.channel = 'whatsapp'
        and ar.status in ('pending', 'sent')
    ) then 'patient_whatsapp_reminder_missing' end
  ], null) as risk_reasons,
  case
    when a.start_time <= now() + interval '2 hours' then 'p0'
    when a.start_time <= now() + interval '24 hours' then 'p1'
    else 'p2'
  end as urgency
from public.appointments a
join public.doctors dp on dp.id = a.doctor_id
join public.profiles dpr on dpr.user_id = dp.user_id
left join public.patients pp on pp.id = a.patient_id
left join public.profiles ppr on ppr.user_id = pp.user_id
where a.status = 'confirmed'
  and a.start_time >= now()
  and (
    coalesce(growth_os.normalize_notification_contact('email', dpr.email), '') = ''
    or growth_os.is_notification_contact_suppressed('email', dpr.email)
    or (
      coalesce(growth_os.normalize_notification_contact('email', dpr.email), '') <> ''
      and not exists (
        select 1 from growth_os.email_jobs ej
        where ej.appointment_id = a.id
          and ej.job_type = 'doctor_new_appointment'
          and ej.status in ('pending', 'processing', 'sent')
      )
    )
    or
    coalesce(growth_os.normalize_notification_contact('whatsapp', dpr.phone), '') = ''
    or growth_os.is_notification_contact_suppressed('whatsapp', dpr.phone)
    or coalesce(growth_os.normalize_notification_contact('whatsapp', ppr.phone), '') = ''
    or not exists (
      select 1 from public.portal_notifications pn
      where pn.user_id = dp.user_id
        and pn.dedupe_key = 'event:appointment.payment_confirmed:' || a.id::text
    )
    or not exists (
      select 1 from growth_os.doctor_whatsapp_jobs dwj
      where dwj.appointment_id = a.id
        and dwj.status in ('pending', 'sent')
    )
    or not exists (
      select 1 from public.appointment_reminders ar
      where ar.appointment_id = a.id
        and ar.channel = 'whatsapp'
        and ar.status in ('pending', 'sent')
    )
  );

grant select on growth_os.appointment_notification_risks to service_role;

comment on view growth_os.appointment_notification_risks is
  'Operational incident guardrail: confirmed upcoming appointments missing doctor portal, doctor WhatsApp, or patient WhatsApp reminder evidence.';

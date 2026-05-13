-- Notify doctors when a paid appointment is confirmed by the payment webhook.
-- Existing insert trigger only covers appointments created directly as scheduled/confirmed.

create table if not exists growth_os.doctor_whatsapp_jobs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_phone text not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_doctor_whatsapp_jobs_due
  on growth_os.doctor_whatsapp_jobs (status, scheduled_for)
  where status = 'pending';

alter table growth_os.doctor_whatsapp_jobs enable row level security;

drop policy if exists service_role_all_doctor_whatsapp_jobs on growth_os.doctor_whatsapp_jobs;
create policy service_role_all_doctor_whatsapp_jobs on growth_os.doctor_whatsapp_jobs
  for all to service_role
  using (true)
  with check (true);

grant all on table growth_os.doctor_whatsapp_jobs to service_role;

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
begin
  if new.doctor_id is null or new.patient_id is null or new.start_time is null then
    return new;
  end if;

  if new.status <> 'confirmed' or coalesce(old.status, '') = 'confirmed' then
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

  if v_doctor_profile.email is not null and v_doctor_profile.email <> '' then
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
      v_doctor_profile.email,
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

  if v_doctor_profile.phone is not null and v_doctor_profile.phone <> '' then
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
      v_doctor_profile.phone,
      v_whatsapp_message,
      'doctor_whatsapp:appointment_confirmed:' || new.id::text
    )
    on conflict (dedupe_key) do nothing;
  end if;

  return new;
end;
$$;

create or replace function growth_os.touch_doctor_whatsapp_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_doctor_whatsapp_jobs_updated_at on growth_os.doctor_whatsapp_jobs;
create trigger trg_touch_doctor_whatsapp_jobs_updated_at
  before update on growth_os.doctor_whatsapp_jobs
  for each row
  execute function growth_os.touch_doctor_whatsapp_jobs_updated_at();

drop trigger if exists trg_enqueue_doctor_confirmed_appointment on public.appointments;
create trigger trg_enqueue_doctor_confirmed_appointment
  after update of status on public.appointments
  for each row
  when (new.status = 'confirmed' and old.status is distinct from 'confirmed')
  execute function growth_os.enqueue_doctor_confirmed_appointment();

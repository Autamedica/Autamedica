-- Trigger for Doctor: New Appointment
create or replace function growth_os.enqueue_doctor_new_appointment()
returns trigger
language plpgsql
security definer
set search_path = growth_os, public
as $$
declare
  v_doctor_profile record;
  v_patient_profile record;
  v_start text;
begin
  if new.doctor_id is null or new.patient_id is null or new.start_time is null then
    return new;
  end if;

  -- Get doctor details
  select pr.user_id, lower(pr.email) as email, nullif(btrim(coalesce(pr.first_name, '')), '') as first_name
  into v_doctor_profile
  from public.doctors d
  join public.profiles pr on pr.user_id = d.user_id
  where d.id = new.doctor_id
  limit 1;

  if v_doctor_profile.email is null or v_doctor_profile.email = '' then
    return new;
  end if;

  -- Get patient details
  select nullif(btrim(coalesce(pr.first_name, '')), '') || ' ' || nullif(btrim(coalesce(pr.last_name, '')), '') as full_name
  into v_patient_profile
  from public.patients p
  join public.profiles pr on pr.user_id = p.user_id
  where p.id = new.patient_id
  limit 1;

  v_start := to_char(new.start_time at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI');

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
      'patient_name', trim(v_patient_profile.full_name),
      'action_url', 'https://www.autamedica.com/doctors/appointments'
    )
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_doctor_new_appointment on public.appointments;
create trigger trg_enqueue_doctor_new_appointment
  after insert on public.appointments
  for each row
  when (new.status in ('scheduled', 'confirmed'))
  execute function growth_os.enqueue_doctor_new_appointment();

-- Trigger for Cancellations (Doctor and Patient)
create or replace function growth_os.enqueue_appointment_cancellations()
returns trigger
language plpgsql
security definer
set search_path = growth_os, public
as $$
declare
  v_doctor_profile record;
  v_patient_profile record;
  v_start text;
begin
  -- Only trigger if status changed to cancelled
  if new.status <> 'cancelled' or old.status = 'cancelled' then
    return new;
  end if;

  v_start := to_char(new.start_time at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI');

  -- Enqueue for Doctor
  select pr.user_id, lower(pr.email) as email, nullif(btrim(coalesce(pr.first_name, '')), '') as first_name, nullif(btrim(coalesce(pr.last_name, '')), '') as last_name
  into v_doctor_profile
  from public.doctors d
  join public.profiles pr on pr.user_id = d.user_id
  where d.id = new.doctor_id
  limit 1;

  -- Enqueue for Patient
  select pr.user_id, lower(pr.email) as email, nullif(btrim(coalesce(pr.first_name, '')), '') as first_name, nullif(btrim(coalesce(pr.last_name, '')), '') as last_name
  into v_patient_profile
  from public.patients p
  join public.profiles pr on pr.user_id = p.user_id
  where p.id = new.patient_id
  limit 1;

  -- Enqueue Email to Doctor
  if v_doctor_profile.email is not null and v_doctor_profile.email <> '' then
    insert into growth_os.email_jobs (
      job_type, recipient_email, recipient_name, user_id, appointment_id, dedupe_key, template_data
    ) values (
      'doctor_appointment_cancelled',
      v_doctor_profile.email,
      v_doctor_profile.first_name,
      v_doctor_profile.user_id,
      new.id,
      'doctor_cancelled:' || new.id::text,
      jsonb_build_object(
        'appointment_time', v_start,
        'patient_name', trim(v_patient_profile.first_name || ' ' || v_patient_profile.last_name),
        'action_url', 'https://www.autamedica.com/doctors/appointments'
      )
    ) on conflict (dedupe_key) do nothing;
  end if;

  -- Enqueue Email to Patient
  if v_patient_profile.email is not null and v_patient_profile.email <> '' then
    insert into growth_os.email_jobs (
      job_type, recipient_email, recipient_name, user_id, appointment_id, dedupe_key, template_data
    ) values (
      'patient_appointment_cancelled',
      v_patient_profile.email,
      v_patient_profile.first_name,
      v_patient_profile.user_id,
      new.id,
      'patient_cancelled:' || new.id::text,
      jsonb_build_object(
        'appointment_time', v_start,
        'doctor_name', 'Dr. ' || trim(v_doctor_profile.first_name || ' ' || v_doctor_profile.last_name),
        'action_url', 'https://www.autamedica.com/patients/appointments'
      )
    ) on conflict (dedupe_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_appointment_cancellations on public.appointments;
create trigger trg_enqueue_appointment_cancellations
  after update on public.appointments
  for each row
  execute function growth_os.enqueue_appointment_cancellations();

-- Trigger for Doctor: Anamnesis Ready
create or replace function growth_os.enqueue_doctor_anamnesis_ready()
returns trigger
language plpgsql
security definer
set search_path = growth_os, public
as $$
declare
  v_doctor_profile record;
  v_patient_profile record;
  v_appointment_id uuid;
  v_doctor_id uuid;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  -- Find the next upcoming appointment for this patient
  select id, doctor_id
  into v_appointment_id, v_doctor_id
  from public.appointments
  where patient_id = new.patient_id
    and status in ('scheduled', 'confirmed')
    and start_time > now()
  order by start_time asc
  limit 1;

  if v_appointment_id is null then
    return new; -- No upcoming appointment, don't email any doctor
  end if;

  -- Get doctor details
  select pr.user_id, lower(pr.email) as email, nullif(btrim(coalesce(pr.first_name, '')), '') as first_name
  into v_doctor_profile
  from public.doctors d
  join public.profiles pr on pr.user_id = d.user_id
  where d.id = v_doctor_id
  limit 1;

  -- Get patient details
  select pr.user_id, nullif(btrim(coalesce(pr.first_name, '')), '') || ' ' || nullif(btrim(coalesce(pr.last_name, '')), '') as full_name
  into v_patient_profile
  from public.patients p
  join public.profiles pr on pr.user_id = p.user_id
  where p.id = new.patient_id
  limit 1;

  if v_doctor_profile.email is not null and v_doctor_profile.email <> '' then
    insert into growth_os.email_jobs (
      job_type, recipient_email, recipient_name, user_id, patient_id, dedupe_key, template_data
    ) values (
      'doctor_anamnesis_ready',
      v_doctor_profile.email,
      v_doctor_profile.first_name,
      v_doctor_profile.user_id,
      new.patient_id,
      'doctor_anamnesis:' || new.id::text || ':' || v_appointment_id::text,
      jsonb_build_object(
        'patient_name', trim(v_patient_profile.full_name),
        'action_url', 'https://www.autamedica.com/doctors/patients/' || new.patient_id::text || '/anamnesis'
      )
    ) on conflict (dedupe_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_doctor_anamnesis_ready on public.anamnesis;
create trigger trg_enqueue_doctor_anamnesis_ready
  after update on public.anamnesis
  for each row
  execute function growth_os.enqueue_doctor_anamnesis_ready();

-- Trigger for Patient: Prescription Ready
create or replace function growth_os.enqueue_patient_prescription_ready()
returns trigger
language plpgsql
security definer
set search_path = growth_os, public
as $$
declare
  v_doctor_profile record;
  v_patient_profile record;
begin
  -- Get doctor details
  select nullif(btrim(coalesce(pr.first_name, '')), '') || ' ' || nullif(btrim(coalesce(pr.last_name, '')), '') as full_name
  into v_doctor_profile
  from public.doctors d
  join public.profiles pr on pr.user_id = d.user_id
  where d.id = new.doctor_id
  limit 1;

  -- Get patient details
  select pr.user_id, lower(pr.email) as email, nullif(btrim(coalesce(pr.first_name, '')), '') as first_name
  into v_patient_profile
  from public.patients p
  join public.profiles pr on pr.user_id = p.user_id
  where p.id = new.patient_id
  limit 1;

  if v_patient_profile.email is not null and v_patient_profile.email <> '' then
    insert into growth_os.email_jobs (
      job_type, recipient_email, recipient_name, user_id, patient_id, dedupe_key, template_data
    ) values (
      'patient_prescription_ready',
      v_patient_profile.email,
      v_patient_profile.first_name,
      v_patient_profile.user_id,
      new.patient_id,
      'patient_prescription:' || new.id::text,
      jsonb_build_object(
        'doctor_name', 'Dr. ' || trim(v_doctor_profile.full_name),
        'action_url', 'https://www.autamedica.com/patients/prescriptions'
      )
    ) on conflict (dedupe_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_patient_prescription_ready on public.prescriptions;
create trigger trg_enqueue_patient_prescription_ready
  after insert on public.prescriptions
  for each row
  execute function growth_os.enqueue_patient_prescription_ready();

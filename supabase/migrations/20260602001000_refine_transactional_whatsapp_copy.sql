-- Refine transactional WhatsApp copy for confirmed appointments.
-- The app fallback uses the same message, but the DB trigger normally creates
-- the doctor WhatsApp job first, so the trigger copy must be updated too.

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
  v_appointment_type text;
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
  v_appointment_type := coalesce(nullif(btrim(new.type), ''), 'Consulta medica');
  v_whatsapp_message := 'AutaMedica - nueva consulta confirmada' || chr(10) ||
    'Paciente: ' || v_patient_name || chr(10) ||
    'Fecha y hora: ' || v_start || chr(10) ||
    'Tipo de atencion: ' || v_appointment_type || chr(10) ||
    'Revisa la agenda y el contexto clinico antes del turno.' || chr(10) ||
    'Agenda medica: https://doctor.autamedica.com/doctors/appointments';

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
    'Consulta confirmada',
    v_patient_name || ' confirmo la consulta para ' || v_start || '.',
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

-- Migration: Send medical order ready emails after the signed PDF exists.
-- Path: supabase/migrations/20260525091500_send_medical_order_email_after_pdf_ready.sql

-- 1. Alter allowed job types constraint to include patient_medical_order_ready
ALTER TABLE growth_os.email_jobs DROP CONSTRAINT IF EXISTS email_jobs_job_type_check;
ALTER TABLE growth_os.email_jobs ADD CONSTRAINT email_jobs_job_type_check
  CHECK (job_type IN (
    'welcome', 'anamnesis_reminder', 'appointment_reminder', 'newsletter',
    'doctor_new_appointment', 'doctor_appointment_cancelled', 'doctor_anamnesis_ready',
    'patient_appointment_cancelled', 'patient_prescription_ready',
    'patient_medical_order_ready', 'nurturing'
  ));

-- 2. Create the enqueue trigger function
create or replace function growth_os.enqueue_patient_medical_order_ready()
returns trigger
language plpgsql
security definer
set search_path = growth_os, public
as $$
declare
  v_doctor_profile record;
  v_patient_profile record;
  v_practices_list text;
  v_verify_url text;
begin
  if new.status <> 'signed' then
    return new;
  end if;

  if new.cuir is null or btrim(new.cuir) = '' then
    return new;
  end if;

  if new.signed_pdf_url is null or btrim(new.signed_pdf_url) = '' then
    return new;
  end if;

  select nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), '') as full_name
  into v_doctor_profile
  from public.doctors d
  join public.profiles pr on pr.user_id = d.user_id
  where d.id = new.doctor_id
  limit 1;

  select pr.user_id, lower(pr.email) as email, nullif(btrim(coalesce(pr.first_name, '')), '') as first_name
  into v_patient_profile
  from public.patients p
  join public.profiles pr on pr.user_id = p.user_id
  where p.id = new.patient_id
  limit 1;

  -- Format the practices list from new.practices
  -- new.practices is JSONB: e.g. [{"name": "Hemograma completo"}, {"name": "Hepatograma"}]
  select string_agg(elem->>'name', ', ')
  into v_practices_list
  from jsonb_array_elements(new.practices) as elem;

  if v_practices_list is null or btrim(v_practices_list) = '' then
    v_practices_list := 'Orden de estudios médicos';
  end if;

  v_verify_url := 'https://www.autamedica.com/verify/' || new.cuir;

  if v_patient_profile.email is not null and v_patient_profile.email <> '' then
    insert into growth_os.email_jobs (
      job_type,
      recipient_email,
      recipient_name,
      user_id,
      patient_id,
      dedupe_key,
      template_data
    ) values (
      'patient_medical_order_ready',
      v_patient_profile.email,
      v_patient_profile.first_name,
      v_patient_profile.user_id,
      new.patient_id,
      'patient_medical_order:' || new.id::text,
      jsonb_build_object(
        'doctor_name', coalesce('Dr/Dra. ' || v_doctor_profile.full_name, 'Tu medico'),
        'study_type', new.study_type,
        'practices_name', v_practices_list,
        'cuir', new.cuir,
        'pdf_url', new.signed_pdf_url,
        'verify_url', v_verify_url,
        'action_url', new.signed_pdf_url,
        'portal_url', 'https://www.autamedica.com/patients/medical-orders'
      )
    )
    on conflict (dedupe_key) do update
      set template_data = excluded.template_data,
          recipient_email = excluded.recipient_email,
          recipient_name = excluded.recipient_name,
          user_id = excluded.user_id,
          patient_id = excluded.patient_id,
          status = 'pending',
          attempts = 0,
          scheduled_for = now(),
          last_error = null,
          provider = null,
          provider_message_id = null,
          sent_at = null;
  end if;

  return new;
end;
$$;

-- 3. Create AFTER UPDATE trigger on public.medical_orders
drop trigger if exists trg_enqueue_patient_medical_order_ready on public.medical_orders;
create trigger trg_enqueue_patient_medical_order_ready
  after update of status, cuir, signed_pdf_url on public.medical_orders
  for each row
  when (
    new.status = 'signed'
    and new.cuir is not null
    and new.signed_pdf_url is not null
    and (
      old.status is distinct from new.status
      or old.cuir is distinct from new.cuir
      or old.signed_pdf_url is distinct from new.signed_pdf_url
    )
  )
  execute function growth_os.enqueue_patient_medical_order_ready();

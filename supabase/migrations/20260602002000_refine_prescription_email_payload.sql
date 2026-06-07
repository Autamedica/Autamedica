-- Refine prescription email payload so the recipe template receives the real
-- medication from the current clinical_data shape.

create or replace function growth_os.enqueue_patient_prescription_ready()
returns trigger
language plpgsql
security definer
set search_path = growth_os, public
as $$
declare
  v_doctor_profile record;
  v_patient_profile record;
  v_medication text;
  v_verify_url text;
begin
  if new.status <> 'sent' then
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

  v_medication := coalesce(
    nullif(btrim(new.clinical_data #>> '{items,0,generic_name}'), ''),
    nullif(btrim(new.clinical_data #>> '{items,0,commercial_name}'), ''),
    nullif(btrim(new.clinical_data #>> '{medication_name}'), ''),
    nullif(btrim(new.clinical_data #>> '{medication,name}'), ''),
    nullif(btrim(new.clinical_data #>> '{medications,0,name}'), ''),
    'Receta digital'
  );
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
      'patient_prescription_ready',
      v_patient_profile.email,
      v_patient_profile.first_name,
      v_patient_profile.user_id,
      new.patient_id,
      'patient_prescription:' || new.id::text,
      jsonb_build_object(
        'doctor_name', coalesce('Dr. ' || v_doctor_profile.full_name, 'Tu medico'),
        'medication_name', v_medication,
        'cuir', new.cuir,
        'pdf_url', new.signed_pdf_url,
        'verify_url', v_verify_url,
        'action_url', new.signed_pdf_url,
        'portal_url', 'https://www.autamedica.com/patients/prescriptions'
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

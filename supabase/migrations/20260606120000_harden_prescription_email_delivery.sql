-- Keep prescription issuance and patient notification aligned with the PDF artifact.

drop trigger if exists trg_enqueue_patient_prescription_ready_insert on public.prescriptions;
create trigger trg_enqueue_patient_prescription_ready_insert
  after insert on public.prescriptions
  for each row
  when (
    new.status = 'sent'
    and new.cuir is not null
    and new.signed_pdf_url is not null
  )
  execute function growth_os.enqueue_patient_prescription_ready();

-- Recover complete prescriptions that never received an email job. Existing jobs,
-- including failed ones, are left untouched to avoid unexpected duplicate sends.
insert into growth_os.email_jobs (
  job_type,
  recipient_email,
  recipient_name,
  user_id,
  patient_id,
  dedupe_key,
  template_data
)
select
  'patient_prescription_ready',
  lower(pr.email),
  nullif(btrim(coalesce(pr.first_name, '')), ''),
  pr.user_id,
  rx.patient_id,
  'patient_prescription:' || rx.id::text,
  jsonb_build_object(
    'doctor_name', coalesce('Dr. ' || nullif(btrim(concat_ws(' ', dpr.first_name, dpr.last_name)), ''), 'Tu medico'),
    'medication_name', coalesce(
      nullif(btrim(rx.clinical_data #>> '{items,0,generic_name}'), ''),
      nullif(btrim(rx.clinical_data #>> '{items,0,commercial_name}'), ''),
      nullif(btrim(rx.clinical_data #>> '{medication_name}'), ''),
      nullif(btrim(rx.clinical_data #>> '{medication,name}'), ''),
      nullif(btrim(rx.clinical_data #>> '{medications,0,name}'), ''),
      'Receta digital'
    ),
    'cuir', rx.cuir,
    'pdf_url', rx.signed_pdf_url,
    'verify_url', 'https://www.autamedica.com/verify/' || rx.cuir,
    'action_url', rx.signed_pdf_url,
    'portal_url', 'https://www.autamedica.com/patients/prescriptions'
  )
from public.prescriptions rx
join public.patients p on p.id = rx.patient_id
join public.profiles pr on pr.user_id = p.user_id
left join public.doctors d on d.id = rx.doctor_id
left join public.profiles dpr on dpr.user_id = d.user_id
where rx.status = 'sent'
  and nullif(btrim(rx.cuir), '') is not null
  and nullif(btrim(rx.signed_pdf_url), '') is not null
  and nullif(btrim(pr.email), '') is not null
  and not exists (
    select 1
    from growth_os.email_jobs ej
    where ej.dedupe_key = 'patient_prescription:' || rx.id::text
  )
on conflict (dedupe_key) do nothing;

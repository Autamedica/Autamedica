-- Keep medical order issuance and patient notification aligned with the PDF artifact.

drop trigger if exists trg_enqueue_patient_medical_order_ready_insert on public.medical_orders;
create trigger trg_enqueue_patient_medical_order_ready_insert
  after insert on public.medical_orders
  for each row
  when (
    new.status = 'signed'
    and new.cuir is not null
    and new.signed_pdf_url is not null
  )
  execute function growth_os.enqueue_patient_medical_order_ready();

-- Recover complete orders that never received an email job. Existing jobs are
-- preserved to avoid resending orders that already entered the delivery pipeline.
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
  'patient_medical_order_ready',
  lower(pr.email),
  nullif(btrim(coalesce(pr.first_name, '')), ''),
  pr.user_id,
  mo.patient_id,
  'patient_medical_order:' || mo.id::text,
  jsonb_build_object(
    'doctor_name', coalesce(
      'Dr/Dra. ' || nullif(btrim(concat_ws(' ', dpr.first_name, dpr.last_name)), ''),
      'Tu medico'
    ),
    'study_type', mo.study_type,
    'practices_name', coalesce(
      (
        select string_agg(elem->>'name', ', ')
        from jsonb_array_elements(mo.practices) as elem
        where nullif(btrim(elem->>'name'), '') is not null
      ),
      'Orden de estudios medicos'
    ),
    'cuir', mo.cuir,
    'pdf_url', mo.signed_pdf_url,
    'verify_url', 'https://www.autamedica.com/verify/' || mo.cuir,
    'action_url', mo.signed_pdf_url,
    'portal_url', 'https://www.autamedica.com/patients/medical-orders'
  )
from public.medical_orders mo
join public.patients p on p.id = mo.patient_id
join public.profiles pr on pr.user_id = p.user_id
left join public.doctors d on d.id = mo.doctor_id
left join public.profiles dpr on dpr.user_id = d.user_id
where mo.status = 'signed'
  and nullif(btrim(mo.cuir), '') is not null
  and nullif(btrim(mo.signed_pdf_url), '') is not null
  and nullif(btrim(pr.email), '') is not null
  and not exists (
    select 1
    from growth_os.email_jobs ej
    where ej.dedupe_key = 'patient_medical_order:' || mo.id::text
  )
on conflict (dedupe_key) do nothing;

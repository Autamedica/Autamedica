ALTER TABLE public.prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_status_check;

ALTER TABLE public.prescriptions
  ADD CONSTRAINT prescriptions_status_check
  CHECK (status = ANY (ARRAY[
    'draft'::text, 'signed'::text, 'sent'::text, 'active'::text,
    'dispensed_partial'::text, 'dispensed_total'::text,
    'cancelled'::text, 'expired'::text
  ]));

CREATE OR REPLACE FUNCTION growth_os.enqueue_patient_prescription_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'growth_os', 'public'
AS $function$
declare
  v_doctor_profile record;
  v_patient_profile record;
  v_medication text;
  v_verify_url text;
begin
  if new.status not in ('sent', 'active') then return new; end if;
  if new.cuir is null or btrim(new.cuir) = '' then return new; end if;
  if new.signed_pdf_url is null or btrim(new.signed_pdf_url) = '' then return new; end if;

  select nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), '') as full_name
  into v_doctor_profile
  from public.doctors d
  join public.profiles pr on pr.user_id = d.user_id
  where d.id = new.doctor_id
  limit 1;

  select pr.user_id, lower(pr.email) as email,
         nullif(btrim(coalesce(pr.first_name, '')), '') as first_name
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
    'Receita digital'
  );
  v_verify_url := 'https://www.autamedica.com/verify/' || new.cuir;

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
        'doctor_name', coalesce('Dr. ' || v_doctor_profile.full_name, 'Profissional'),
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
$function$;

DROP TRIGGER IF EXISTS trg_enqueue_patient_prescription_ready ON public.prescriptions;
DROP TRIGGER IF EXISTS trg_enqueue_patient_prescription_ready_insert ON public.prescriptions;

CREATE TRIGGER trg_enqueue_patient_prescription_ready
AFTER UPDATE OF status, cuir, signed_pdf_url ON public.prescriptions
FOR EACH ROW
WHEN (
  new.status IN ('sent', 'active')
  AND new.cuir IS NOT NULL
  AND new.signed_pdf_url IS NOT NULL
  AND (
    old.status IS DISTINCT FROM new.status
    OR old.cuir IS DISTINCT FROM new.cuir
    OR old.signed_pdf_url IS DISTINCT FROM new.signed_pdf_url
  )
)
EXECUTE FUNCTION growth_os.enqueue_patient_prescription_ready();

CREATE TRIGGER trg_enqueue_patient_prescription_ready_insert
AFTER INSERT ON public.prescriptions
FOR EACH ROW
WHEN (new.status IN ('sent', 'active') AND new.cuir IS NOT NULL AND new.signed_pdf_url IS NOT NULL)
EXECUTE FUNCTION growth_os.enqueue_patient_prescription_ready();

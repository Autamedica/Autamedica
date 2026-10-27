-- Phase 1: prevent unsigned certificate drafts from being labelled as signed.
-- Deliberately does not relabel existing records; historical rows require manual audit.
ALTER TABLE public.medical_certificates
  ALTER COLUMN status SET DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS signature_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS signature_hash text,
  ADD COLUMN IF NOT EXISTS signature_method text,
  ADD COLUMN IF NOT EXISTS treatment text;

-- Existing legacy signed records may not have signature evidence.
-- NOT VALID enforces the gate for NEW inserts/updates without breaking migration
-- on historical documents; do not VALIDATE until old rows have been reviewed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.medical_certificates'::regclass
      AND conname = 'medical_certificates_signed_requires_verified_evidence'
  ) THEN
    ALTER TABLE public.medical_certificates
      ADD CONSTRAINT medical_certificates_signed_requires_verified_evidence
      CHECK (
        status <> 'signed'
        OR (
          signed_pdf_url IS NOT NULL
          AND length(btrim(signed_pdf_url)) > 0
          AND signature_verified_at IS NOT NULL
          AND signature_hash IS NOT NULL
          AND length(btrim(signature_hash)) > 0
          AND signature_method IN ('ac_external', 'electronic_verified')
        )
      ) NOT VALID;
  END IF;
END;
$$;

-- The Android client has historically inserted rows directly via RLS.
-- It must never be allowed to insert a pre-signed document.
DROP POLICY IF EXISTS "Doctors can insert their own certificates" ON public.medical_certificates;
CREATE POLICY "Doctors can insert their own certificates"
  ON public.medical_certificates FOR INSERT TO authenticated
  WITH CHECK (
    status = 'draft'
    AND doctor_id IN (SELECT id FROM public.doctors WHERE user_id = (SELECT auth.uid()))
  );

-- Only the issuing clinician sees unsigned drafts. Patients should not
-- receive or browse unsigned records before evidence-backed issuance.
DROP POLICY IF EXISTS "Patients can view their own certificates" ON public.medical_certificates;
CREATE POLICY "Patients can view their own certificates"
  ON public.medical_certificates FOR SELECT TO authenticated
  USING (
    patient_id IN (SELECT id FROM public.patients WHERE user_id = (SELECT auth.uid()))
    AND status = 'signed'
    AND signed_pdf_url IS NOT NULL
    AND signature_verified_at IS NOT NULL
    AND signature_hash IS NOT NULL
    AND signature_method IN ('ac_external', 'electronic_verified')
  );

-- Prevent a regular doctor client from rewriting an already issued document
-- as a draft or updating an issued certificate through this policy.
DROP POLICY IF EXISTS "Doctors can update their draft certificates" ON public.medical_certificates;
CREATE POLICY "Doctors can update their draft certificates"
  ON public.medical_certificates FOR UPDATE TO authenticated
  USING (
    status = 'draft'
    AND doctor_id IN (SELECT id FROM public.doctors WHERE user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    status = 'draft'
    AND doctor_id IN (SELECT id FROM public.doctors WHERE user_id = (SELECT auth.uid()))
  );

-- The authorized signing flow (to be developed) must verify the signature,
-- store immutable evidence, and transition draft -> signed server-side.


-- Do not notify patients that an unsigned draft has been "issued".
-- The previous trigger fired on every INSERT, including draft records.
-- A notification should only be sent once a trusted signing workflow
-- transitions the document to a signed state.
CREATE OR REPLACE FUNCTION public.enqueue_certificate_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_patient_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'signed' THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status <> 'signed' OR OLD.status = 'signed' THEN RETURN NEW; END IF;
  ELSE
    RETURN NEW;
  END IF;

  SELECT p.user_id INTO v_patient_user_id
  FROM public.patients p WHERE p.id = NEW.patient_id;

  IF v_patient_user_id IS NOT NULL THEN
    PERFORM public.enqueue_notification(
      p_user_id := v_patient_user_id,
      p_type := 'CERTIFICATE_ISSUED',
      p_title := 'Atestado disponible',
      p_body := 'Tu atestado médico firmado ya está disponible en la app.',
      p_deep_link := 'autamedica://certificates',
      p_data := jsonb_build_object(
        'certificate_id', NEW.id::text,
        'certificate_type', NEW.certificate_type::text
      ),
      p_dedupe_key := 'certificate_issued:' || NEW.id::text,
      p_scheduled_at := now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_certificate_notification ON public.medical_certificates;
CREATE TRIGGER trg_enqueue_certificate_notification
  AFTER INSERT OR UPDATE OF status ON public.medical_certificates
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_certificate_notification();

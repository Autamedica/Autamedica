-- Argentine medical certificates: an issued certificate must never be
-- silently reverted to draft. Preserve existing clinical records and
-- all evidence; no historical data is reclassified by this migration.
--
-- The previous guard ignored changes to "status" when OLD.status='signed',
-- allowing a signed-to-draft transition with all other columns unchanged.
-- This hardens the existing trigger without changing the issuance RPC.

CREATE OR REPLACE FUNCTION public.guard_certificate_electronic_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'signed' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'issued_certificate_status_immutable';
    END IF;

    IF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM
       (to_jsonb(OLD) - 'updated_at') THEN
      RAISE EXCEPTION 'issued_certificate_immutable';
    END IF;
  END IF;

  IF NEW.status = 'signed' AND NEW.signature_method = 'electronic_verified' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.medical_certificate_electronic_issuances e
      WHERE e.certificate_id = NEW.id
        AND e.pdf_hash = NEW.signature_hash
        AND e.pdf_path = NEW.signed_pdf_url
        AND e.confirmed_at = NEW.signature_verified_at
    ) THEN
      RAISE EXCEPTION 'certificate_confirmation_evidence_missing';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_certificate_electronic_evidence()
  FROM PUBLIC, anon, authenticated;

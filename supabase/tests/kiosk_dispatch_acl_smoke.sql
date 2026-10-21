-- Run ONLY against a database where harden_pharmacy_dispatch_pii_rls
-- migration has been applied. Read-only metadata assertions; no PHI queried.
DO $check$
BEGIN
  IF to_regclass('public.pharmacy_dispatch_requests') IS NULL THEN
    RAISE EXCEPTION 'Missing pharmacy dispatch table';
  END IF;

  IF has_table_privilege('anon','public.pharmacy_dispatch_requests','SELECT') OR
     has_table_privilege('anon','public.pharmacy_dispatch_requests','UPDATE') THEN
    RAISE EXCEPTION 'Anonymous access to dispatch requests not revoked';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='pharmacy_dispatch_requests'
      AND policyname IN (
        'pharmacy_dispatch_requests_select_kiosk_or_confined',
        'pharmacy_dispatch_requests_update_kiosk_or_assigned'
      )
  ) THEN
    RAISE EXCEPTION 'Unscoped kiosk dispatch policies remain';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='pharmacy_dispatch_requests'
      AND policyname='pharmacy_dispatch_requests_select_scoped'
      AND roles='{authenticated}'::name[]
  ) THEN
    RAISE EXCEPTION 'Authenticated scoped dispatch SELECT policy missing';
  END IF;

  IF has_column_privilege('authenticated','public.pharmacy_dispatch_requests','patient_phone','UPDATE')
     OR has_column_privilege('authenticated','public.pharmacy_dispatch_requests','patient_cpf','UPDATE')
     OR has_column_privilege('authenticated','public.pharmacy_dispatch_requests','symptom_summary','UPDATE') THEN
    RAISE EXCEPTION 'Client can update protected dispatch patient columns';
  END IF;

  IF NOT has_column_privilege('authenticated','public.pharmacy_dispatch_requests','status','UPDATE') THEN
    RAISE EXCEPTION 'Authenticated lifecycle status update unexpectedly blocked';
  END IF;
END;
$check$;

DO $assert$
DECLARE
  policy_count integer;
BEGIN
  IF has_table_privilege('anon','public.memed_doctor_identities','SELECT')
      OR has_table_privilege('authenticated','public.memed_doctor_identities','SELECT') THEN
    RAISE EXCEPTION 'Memed physician CPF exposed to untrusted roles';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.memed_doctor_identities'::regclass) THEN
    RAISE EXCEPTION 'Memed private identity RLS disabled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid =
      to_regclass('public.prescriptions_memed_vendor_id_unique') AND indisunique AND indisvalid) THEN
    RAISE EXCEPTION 'Memed provider idempotency index missing';
  END IF;
  SELECT count(*) INTO policy_count FROM pg_policy
    WHERE polrelid='public.prescriptions'::regclass AND NOT polpermissive
    AND polname IN ('memed_server_insert_only','memed_server_update_only','memed_server_delete_only')
    AND 'authenticated'::regrole::oid = ANY(polroles);
  IF policy_count <> 3 THEN RAISE EXCEPTION 'Memed server-only write guards missing'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.prescriptions'::regclass) THEN
    RAISE EXCEPTION 'Prescription RLS disabled';
  END IF;
END
$assert$;

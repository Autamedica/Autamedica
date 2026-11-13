-- Read-only regression test for future postgres-owned public tables.
-- Supabase-managed supabase_admin default ACLs must be evaluated separately.
DO $guard$
DECLARE remaining int;
BEGIN
  SELECT count(*) INTO remaining
  FROM pg_default_acl d
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE d.defaclrole='postgres'::regrole
    AND d.defaclnamespace='public'::regnamespace
    AND d.defaclobjtype='r'
    AND a.grantee IN ('anon'::regrole,'authenticated'::regrole)
    AND a.privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES');
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'Unsafe postgres default table privileges: %', remaining;
  END IF;
END;
$guard$;

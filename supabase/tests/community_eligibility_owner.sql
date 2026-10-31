-- Manual regression probe. Execute in a transaction with representative
-- existing records; no INSERT/UPDATE/DELETE or patient identifiers are output.
-- The SQL function itself is called with test JWT claims. Production test
-- confirmed all four cases on 2026-10-31; local seed may need fixtures.
BEGIN;
DO $verify$
DECLARE
  v_patient uuid; v_owner uuid; v_other uuid; v_group uuid;
BEGIN
  SELECT id,user_id INTO v_patient,v_owner FROM public.patients
  WHERE user_id IS NOT NULL LIMIT 1;
  SELECT user_id INTO v_other FROM public.patients
  WHERE user_id IS NOT NULL AND user_id <> v_owner LIMIT 1;
  SELECT id INTO v_group FROM public.community_groups
  WHERE deleted_at IS NULL AND required_gender IS NULL LIMIT 1;
  IF v_patient IS NULL OR v_owner IS NULL OR v_other IS NULL OR v_group IS NULL THEN
    RAISE EXCEPTION 'Test fixture missing; do not treat as a passing test';
  END IF;

  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
  IF auth.uid() IS NOT NULL OR
    public.community_group_allowed_for_patient(v_patient,v_group) IS DISTINCT FROM FALSE
    THEN RAISE EXCEPTION 'Unauthorized anonymous eligibility'; END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',v_other)::text,true);
  IF public.community_group_allowed_for_patient(v_patient,v_group) IS DISTINCT FROM FALSE
    THEN RAISE EXCEPTION 'Unauthorized cross-patient eligibility'; END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',v_owner)::text,true);
  IF auth.uid() IS DISTINCT FROM v_owner OR
     public.community_group_allowed_for_patient(v_patient,v_group) IS DISTINCT FROM TRUE
    THEN RAISE EXCEPTION 'Legitimate patient eligibility blocked'; END IF;

  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  IF public.community_group_allowed_for_patient(v_patient,v_group) IS DISTINCT FROM TRUE
    THEN RAISE EXCEPTION 'Service role eligibility blocked'; END IF;
END;
$verify$;
ROLLBACK;

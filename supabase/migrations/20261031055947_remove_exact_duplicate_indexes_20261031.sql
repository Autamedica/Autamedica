-- Reconcile production migration 20261031055947_remove_exact_duplicate_indexes_20261031.
-- These are exact redundant pairs according to pg_index, including uniqueness,
-- keys, operators, collations, expressions and predicates.
-- Retain uq_portal_notifications_user_dedupe (backs a UNIQUE constraint).
SET lock_timeout = '2s';
SET statement_timeout = '15s';

DO $dedupe$
DECLARE v RECORD; a pg_index%ROWTYPE; b pg_index%ROWTYPE;
BEGIN
 FOR v IN SELECT * FROM (VALUES
    ('public.idx_doctors_active_duty_tiers','public.idx_doctors_on_duty_pharmacy'),
    ('public.idx_portal_notifications_user_dedupe','public.uq_portal_notifications_user_dedupe')
 ) AS x(redundant_index,retained_index)
 LOOP
  SELECT * INTO a FROM pg_index WHERE indexrelid=to_regclass(v.redundant_index);
  SELECT * INTO b FROM pg_index WHERE indexrelid=to_regclass(v.retained_index);
  -- Existing databases may contain a redundant index that was never created
  -- by the canonical migration replay. Missing redundant index is already
  -- the desired result, provided the required retained index exists.
  IF b.indexrelid IS NULL THEN
    RAISE EXCEPTION 'Required retained index missing: %',v.retained_index;
  END IF;
  IF a.indexrelid IS NULL THEN
    CONTINUE;
  END IF;
  IF a.indrelid IS DISTINCT FROM b.indrelid
   OR a.indisunique IS DISTINCT FROM b.indisunique
   OR a.indkey IS DISTINCT FROM b.indkey
   OR a.indclass IS DISTINCT FROM b.indclass
   OR a.indcollation IS DISTINCT FROM b.indcollation
   OR a.indoption IS DISTINCT FROM b.indoption
   OR a.indexprs IS DISTINCT FROM b.indexprs
   OR a.indpred IS DISTINCT FROM b.indpred
   OR NOT (a.indisready AND b.indisready AND a.indisvalid AND b.indisvalid)
   OR EXISTS (SELECT 1 FROM pg_constraint WHERE conindid=a.indexrelid)
   OR EXISTS (SELECT 1 FROM pg_depend WHERE objid=a.indexrelid AND deptype IN ('i','e'))
  THEN RAISE EXCEPTION 'Index equivalence/invariants failed for %',v.redundant_index;
  END IF;
 END LOOP;
END;
$dedupe$;

DROP INDEX IF EXISTS public.idx_doctors_active_duty_tiers;
DROP INDEX IF EXISTS public.idx_portal_notifications_user_dedupe;

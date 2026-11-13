-- Read-only release readiness. Safe on staging or production.
-- Zero patient rows or names/phones/CPF fetched, no DDL/DML, no side effects.
-- A true catalog check only shows a deployed object, NOT a passing integration
-- test and never substitutes for disposable-DB migration replay.
WITH predicates AS (
 SELECT
  to_regclass('public.dispatch_offers') IS NOT NULL AS dispatch_offer_table,
  EXISTS(SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='pharmacy_dispatch_requests'
           AND column_name='price_brl') AS patient_price_column,
  EXISTS(SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='pharmacy_dispatch_requests'
           AND column_name='doctor_fee_brl') AS medical_offer_column,
  to_regprocedure('public.match_dispatch_doctors(uuid)') IS NOT NULL AS dispatcher,
  EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
         JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname='pharmacy_dispatch_requests'
           AND t.tgname='zz_jordan_br_referral' AND t.tgenabled='O') AS brazil_only,
  EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
         JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname='pharmacy_dispatch_requests'
           AND t.tgname='trg_set_jordan_br_dispatch_quote' AND t.tgenabled='O') AS quote_before_insert,
  COALESCE(position('WHEN v_is_jordan THEN 40.00' IN
    pg_get_functiondef(to_regprocedure('public.match_dispatch_doctors(uuid)')))>0,false)
    AS jordan_doctor_40,
  COALESCE(position('try_credit_verified_jordan' IN
    pg_get_functiondef(to_regprocedure('public.sync_pharmacy_referral_commission()')))>0,false)
    AS verified_commission_only,
  to_regclass('public.commercial_referral_identity_proofs') IS NOT NULL
    AS verified_identity_table
)
SELECT 'dispatch_offers' AS control,dispatch_offer_table AS installed FROM predicates
UNION ALL SELECT 'request_price_brl',patient_price_column FROM predicates
UNION ALL SELECT 'request_doctor_fee_brl',medical_offer_column FROM predicates
UNION ALL SELECT 'match_dispatch_doctors',dispatcher FROM predicates
UNION ALL SELECT 'jordan_br_only_trigger',brazil_only FROM predicates
UNION ALL SELECT 'jordan_quote_trigger',quote_before_insert FROM predicates
UNION ALL SELECT 'jordan_doctor_offer_40',jordan_doctor_40 FROM predicates
UNION ALL SELECT 'jordan_verified_commission_only',verified_commission_only FROM predicates
UNION ALL SELECT 'jordan_verified_identity_table',verified_identity_table FROM predicates
ORDER BY control;

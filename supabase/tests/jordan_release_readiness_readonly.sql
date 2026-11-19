-- Read-only release readiness. Safe on staging or production.
-- No patient rows, names, phone numbers or CPF values are selected.
WITH predicates AS (
 SELECT
  to_regclass('public.dispatch_offers') IS NOT NULL AS dispatch_offer_table,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pharmacy_dispatch_requests' AND column_name='price_brl') AS patient_price_column,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pharmacy_dispatch_requests' AND column_name='doctor_fee_brl') AS medical_offer_column,
  to_regprocedure('public.match_dispatch_doctors(uuid)') IS NOT NULL AS dispatcher,
  COALESCE(position('BRAZIL_PAYMENT_REQUIRED' IN pg_get_functiondef(to_regprocedure('public.match_dispatch_doctors(uuid)')))>0,false) AS br_payment_gate,
  COALESCE(position('patient_phone' IN pg_get_functiondef(to_regprocedure('public.sync_pharmacy_referral_commission()')))>0,false) AS phone_first_conversion,
  COALESCE(position('patient_cpf' IN pg_get_functiondef(to_regprocedure('public.sync_pharmacy_referral_commission()')))>0,false) AS cpf_first_conversion,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='commercial_referral_commissions' AND column_name='payment_reference') AS commission_transfer_reference
)
SELECT 'dispatch_offers' AS control,dispatch_offer_table AS installed FROM predicates
UNION ALL SELECT 'request_price_brl',patient_price_column FROM predicates
UNION ALL SELECT 'request_doctor_fee_brl',medical_offer_column FROM predicates
UNION ALL SELECT 'match_dispatch_doctors',dispatcher FROM predicates
UNION ALL SELECT 'br_payment_gate',br_payment_gate FROM predicates
UNION ALL SELECT 'first_conversion_by_phone',phone_first_conversion FROM predicates
UNION ALL SELECT 'first_conversion_by_cpf',cpf_first_conversion FROM predicates
UNION ALL SELECT 'commission_transfer_reference',commission_transfer_reference FROM predicates
ORDER BY control;

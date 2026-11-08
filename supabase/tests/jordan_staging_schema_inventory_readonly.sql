-- Jordan staging parity inventory: read-only, no PHI, no DDL/DML.
-- Run the same query against BOTH Supabase projects, then compare sorted rows.
-- Zero data from patient, dispatch or payment records is selected.
-- Does NOT establish readiness for commercial operations.
WITH catalog AS (
  SELECT 'column'::text AS kind,
         c.table_name::text AS object_name,
         c.column_name::text AS element,
         (c.data_type || '/nullable=' || c.is_nullable)::text AS details
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name IN (
      'pharmacy_dispatch_requests','dispatch_offers',
      'pharmacy_dispatch_payments','commercial_referral_commissions',
      'doctor_duty_status','pharmacy_guest_dispatch_sessions'
    )

  UNION ALL

  SELECT 'trigger', names.relname, names.tgname,
         (CASE WHEN names.tgenabled = 'O' THEN 'enabled'
               ELSE names.tgenabled::text END)
  FROM pg_trigger t0
  JOIN pg_class t ON t.oid = t0.tgrelid
  JOIN pg_namespace ns ON ns.oid = t.relnamespace
  CROSS JOIN LATERAL (
    SELECT t.relname AS relname, t0.tgname AS tgname,
           t0.tgenabled AS tgenabled
  ) names
  WHERE ns.nspname = 'public'
    AND names.relname IN (
      'pharmacy_dispatch_requests','dispatch_offers',
      'pharmacy_dispatch_payments','commercial_referral_commissions'
    )
    AND NOT t0.tgisinternal

  UNION ALL

  SELECT 'function', p.proname::text,
         pg_get_function_identity_arguments(p.oid)::text,
         ns.nspname::text
  FROM pg_proc p
  JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname IN ('public','app_private')
    AND p.proname IN (
      'match_dispatch_doctors', 'claim_pharmacy_request_tier',
      'sync_pharmacy_referral_commission',
      'set_jordan_br_dispatch_quote','guard_jordan_br_referral',
      'assign_dispatch_patient_id','guard_pharmacy_dispatch_update'
    )
)
SELECT kind,object_name,element,details
FROM catalog
ORDER BY kind,object_name,element;

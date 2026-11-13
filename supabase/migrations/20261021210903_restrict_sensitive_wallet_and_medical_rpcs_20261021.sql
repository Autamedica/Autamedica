-- Mirror of live security migration applied 2026-10-21.
-- Patient wallet credit grant is called from server-side administrator/webhook clients;
-- direct invocation by anon/authenticated is not authorized.
-- Medical-record authorization grant is also restricted pending ownership checks.
REVOKE EXECUTE ON FUNCTION public.grant_patient_wallet_credit(uuid,bigint,text,uuid,uuid,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_medical_record_authorization(uuid,uuid,text,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_patient_wallet_credit(uuid,bigint,text,uuid,uuid,text,timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_medical_record_authorization(uuid,uuid,text,integer)
  TO service_role;

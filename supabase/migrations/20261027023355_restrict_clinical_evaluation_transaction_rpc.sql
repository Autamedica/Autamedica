-- Applied and verified in production; preserve the exact migration ledger version.
REVOKE EXECUTE ON FUNCTION public.log_clinical_rule_evaluation_transaction(uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_clinical_rule_evaluation_transaction(uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid) TO service_role;

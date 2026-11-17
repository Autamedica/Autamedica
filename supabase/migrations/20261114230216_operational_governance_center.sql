-- Four independent operational domains and audited administrative controls.
CREATE TABLE IF NOT EXISTS public.platform_operational_domains (
 scope_key text PRIMARY KEY CHECK(scope_key IN ('GLOBAL','BR','AR','JORDAN','EXPRESS')),
 operational_status text NOT NULL DEFAULT 'healthy' CHECK(operational_status IN ('healthy','degraded','outage','maintenance')),
 clinical_status text NOT NULL DEFAULT 'ready' CHECK(clinical_status IN ('ready','degraded','pending_issuance','unavailable')),
 financial_status text NOT NULL DEFAULT 'ready' CHECK(financial_status IN ('ready','degraded','pending_reconciliation','unavailable')),
 commercial_status text NOT NULL DEFAULT 'enabled' CHECK(commercial_status IN ('enabled','limited','paused','disabled')),
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),reason text,state_audit jsonb NOT NULL DEFAULT '{}'::jsonb
);
INSERT INTO public.platform_operational_domains(scope_key) VALUES('GLOBAL'),('BR'),('AR'),('JORDAN'),('EXPRESS') ON CONFLICT(scope_key) DO NOTHING;
ALTER TABLE public.platform_operational_domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_operational_domains_admin_read ON public.platform_operational_domains;
CREATE POLICY platform_operational_domains_admin_read ON public.platform_operational_domains FOR SELECT TO authenticated
USING(COALESCE(auth.jwt()->'app_metadata'->>'role','') IN ('admin','platform_admin','organization_admin') OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.active IS TRUE AND p.role IN ('admin','platform_admin','organization_admin')));
REVOKE ALL ON public.platform_operational_domains FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.platform_operational_domains TO authenticated;
GRANT ALL ON public.platform_operational_domains TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_operational_domain_status(p_scope_key text,p_domain text,p_status text,p_reason text,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $function$
DECLARE v_current public.platform_operational_domains%ROWTYPE;v_previous text;v_now timestamptz:=now();
BEGIN
 IF p_actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_actor_id AND active IS TRUE AND role IN ('admin','platform_admin','organization_admin')) THEN RAISE EXCEPTION 'active_admin_required' USING ERRCODE='42501';END IF;
 IF p_scope_key NOT IN ('GLOBAL','BR','AR','JORDAN','EXPRESS') THEN RAISE EXCEPTION 'invalid_governance_scope' USING ERRCODE='22023';END IF;
 IF p_reason IS NULL OR length(btrim(p_reason))<8 OR length(p_reason)>500 THEN RAISE EXCEPTION 'audit_reason_required' USING ERRCODE='22023';END IF;
 IF NOT((p_domain='operational_status' AND p_status IN('healthy','degraded','outage','maintenance')) OR(p_domain='clinical_status' AND p_status IN('ready','degraded','pending_issuance','unavailable')) OR(p_domain='financial_status' AND p_status IN('ready','degraded','pending_reconciliation','unavailable')) OR(p_domain='commercial_status' AND p_status IN('enabled','limited','paused','disabled'))) THEN RAISE EXCEPTION 'invalid_domain_status' USING ERRCODE='22023';END IF;
 SELECT * INTO v_current FROM public.platform_operational_domains WHERE scope_key=p_scope_key FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'governance_scope_not_found';END IF;
 v_previous:=CASE p_domain WHEN 'operational_status' THEN v_current.operational_status WHEN 'clinical_status' THEN v_current.clinical_status WHEN 'financial_status' THEN v_current.financial_status WHEN 'commercial_status' THEN v_current.commercial_status END;
 UPDATE public.platform_operational_domains SET
 operational_status=CASE WHEN p_domain='operational_status' THEN p_status ELSE operational_status END,
 clinical_status=CASE WHEN p_domain='clinical_status' THEN p_status ELSE clinical_status END,
 financial_status=CASE WHEN p_domain='financial_status' THEN p_status ELSE financial_status END,
 commercial_status=CASE WHEN p_domain='commercial_status' THEN p_status ELSE commercial_status END,
 updated_by=p_actor_id,updated_at=v_now,reason=btrim(p_reason),
 state_audit=COALESCE(state_audit,'{}'::jsonb)||jsonb_build_object(p_domain,jsonb_build_object('previous_status',v_previous,'status',p_status,'approved_by',p_actor_id,'reason',btrim(p_reason),'timestamp',v_now))
 WHERE scope_key=p_scope_key RETURNING * INTO v_current;
 INSERT INTO public.audit_logs(user_id,action,resource_type,metadata) VALUES(p_actor_id,'operational_governance_status_changed','platform_operational_domains',jsonb_build_object('scope_key',p_scope_key,'domain',p_domain,'previous_status',v_previous,'status',p_status,'approved_by',p_actor_id,'reason',btrim(p_reason),'timestamp',v_now));
 RETURN jsonb_build_object('success',true,'scope',p_scope_key,'domain',p_domain,'previous_status',v_previous,'status',p_status,'updated_at',v_now);
END;$function$;
REVOKE ALL ON FUNCTION public.admin_set_operational_domain_status(text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_operational_domain_status(text,text,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_purge_orphan_dispatch_requests(p_actor_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $function$
DECLARE v_count integer:=0;v_now timestamptz:=now();
BEGIN
 IF p_actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_actor_id AND active IS TRUE AND role IN ('admin','platform_admin','organization_admin')) THEN RAISE EXCEPTION 'active_admin_required' USING ERRCODE='42501';END IF;
 IF p_reason IS NULL OR length(btrim(p_reason))<8 OR length(p_reason)>500 THEN RAISE EXCEPTION 'audit_reason_required' USING ERRCODE='22023';END IF;
 UPDATE public.pharmacy_dispatch_requests SET status='expired',updated_at=v_now,search_timeout_at=COALESCE(search_timeout_at,v_now)
 WHERE status='searching' AND search_timeout_at IS NOT NULL AND search_timeout_at<v_now AND assigned_doctor_id IS NULL AND call_id IS NULL;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 INSERT INTO public.audit_logs(user_id,action,resource_type,metadata) VALUES(p_actor_id,'admin_dispatch_orphan_purge','pharmacy_dispatch_requests',jsonb_build_object('purged_count',v_count,'reason',btrim(p_reason),'timestamp',v_now,'scope','searching timeout expirado, sin médico y sin llamada'));
 RETURN jsonb_build_object('success',true,'purged_count',v_count,'timestamp',v_now);
END;$function$;
REVOKE ALL ON FUNCTION public.admin_purge_orphan_dispatch_requests(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_orphan_dispatch_requests(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_review_cfm_license(p_license_id uuid,p_cfm_status text,p_license_status text,p_reason text,p_evidence_path text,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $function$
DECLARE v_license public.doctor_licenses%ROWTYPE;v_now timestamptz:=now();
BEGIN
 IF p_actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_actor_id AND active IS TRUE AND role IN ('admin','platform_admin','organization_admin')) THEN RAISE EXCEPTION 'active_admin_required' USING ERRCODE='42501';END IF;
 IF p_license_id IS NULL OR p_cfm_status NOT IN('valid','pending') OR p_license_status NOT IN('active','inactive') OR p_reason IS NULL OR length(btrim(p_reason))<10 OR length(p_reason)>2000 THEN RAISE EXCEPTION 'invalid_cfm_review_payload' USING ERRCODE='22023';END IF;
 IF p_cfm_status='valid' AND(p_license_status<>'active' OR NULLIF(btrim(p_evidence_path),'') IS NULL) THEN RAISE EXCEPTION 'cfm_approval_requires_evidence' USING ERRCODE='22023';END IF;
 SELECT * INTO v_license FROM public.doctor_licenses WHERE id=p_license_id AND license_type='CRM' AND NULLIF(btrim(uf_brazil),'') IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'brazil_crm_license_not_found' USING ERRCODE='P0002';END IF;
 UPDATE public.doctor_licenses SET cfm_validation_status=p_cfm_status,cfm_last_checked_at=v_now,cfm_review_notes=btrim(p_reason),cfm_reviewed_by=p_actor_id,cfm_reviewed_at=v_now,status=p_license_status,cfm_evidence_path=COALESCE(NULLIF(btrim(p_evidence_path),''),cfm_evidence_path) WHERE id=p_license_id RETURNING * INTO v_license;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata) VALUES(p_actor_id,'admin_cfm_license_reviewed','doctor_licenses',p_license_id,jsonb_build_object('doctor_id',v_license.doctor_id,'license_number',v_license.license_number,'cfm_status',p_cfm_status,'license_status',p_license_status,'evidence_path',v_license.cfm_evidence_path,'approved_by',p_actor_id,'reason',btrim(p_reason),'timestamp',v_now));
 RETURN jsonb_build_object('success',true,'license_id',p_license_id,'cfm_status',p_cfm_status,'license_status',p_license_status,'approved_by',p_actor_id,'timestamp',v_now);
END;$function$;
REVOKE ALL ON FUNCTION public.admin_review_cfm_license(uuid,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_cfm_license(uuid,text,text,text,text,uuid) TO service_role;

DROP FUNCTION IF EXISTS public.admin_manual_approve_pharmacy_payment(uuid,uuid);
CREATE OR REPLACE FUNCTION public.admin_manual_approve_pharmacy_payment(p_payment_id uuid,p_actor_id uuid,p_reason text,p_evidence_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public','app_private' AS $function$
DECLARE v_payment public.pharmacy_dispatch_payments%ROWTYPE;v_dispatch_status text;v_dispatch_result jsonb:=jsonb_build_object('success',false,'code','REQUEST_NOT_SEARCHING');v_original_provider_payment_id text;v_override_at timestamptz:=now();
BEGIN
 IF p_actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_actor_id AND active IS TRUE AND role IN('admin','platform_admin','organization_admin')) THEN RAISE EXCEPTION 'active_admin_required' USING ERRCODE='42501';END IF;
 IF p_reason IS NULL OR length(btrim(p_reason))<10 OR length(p_reason)>2000 OR p_evidence_reference IS NULL OR length(btrim(p_evidence_reference))<4 OR length(p_evidence_reference)>300 THEN RAISE EXCEPTION 'manual_override_reason_and_evidence_required' USING ERRCODE='22023';END IF;
 SELECT * INTO v_payment FROM public.pharmacy_dispatch_payments WHERE id=p_payment_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'code','PAYMENT_NOT_FOUND');END IF;
 IF v_payment.status NOT IN('pending','pending_payment') THEN RETURN jsonb_build_object('success',false,'code','PAYMENT_NOT_PENDING');END IF;
 v_original_provider_payment_id:=v_payment.provider_payment_id;
 UPDATE public.pharmacy_dispatch_payments SET status='approved',provider_payment_id=COALESCE(provider_payment_id,'MANUAL_OVERRIDE_'||p_actor_id::text),paid_at=COALESCE(paid_at,v_override_at),
 metadata=jsonb_set(jsonb_set(jsonb_set(jsonb_set(COALESCE(metadata,'{}'::jsonb),'{manual_override_by}',to_jsonb(p_actor_id),true),'{manual_override_at}',to_jsonb(v_override_at),true),'{manual_override_reason}',to_jsonb(btrim(p_reason)),true),'{manual_override_evidence_reference}',to_jsonb(btrim(p_evidence_reference)),true)
 WHERE id=p_payment_id RETURNING * INTO v_payment;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata) VALUES(p_actor_id,'pharmacy_payment_manual_override_approved','pharmacy_dispatch_payments',v_payment.id,jsonb_build_object('dispatch_request_id',v_payment.dispatch_request_id,'provider_payment_id',v_payment.provider_payment_id,'original_provider_payment_id',v_original_provider_payment_id,'manual_override_at',v_payment.paid_at,'reason',btrim(p_reason),'evidence_reference',btrim(p_evidence_reference),'approved_by',p_actor_id));
 SELECT status::text INTO v_dispatch_status FROM public.pharmacy_dispatch_requests WHERE id=v_payment.dispatch_request_id;
 IF v_dispatch_status='searching' THEN v_dispatch_result:=public.match_dispatch_doctors(v_payment.dispatch_request_id);END IF;
 RETURN jsonb_build_object('success',true,'payment_id',v_payment.id,'dispatch_request_id',v_payment.dispatch_request_id,'status',v_payment.status,'provider_payment_id',v_payment.provider_payment_id,'manual_override_by',p_actor_id,'dispatch_result',v_dispatch_result);
END;$function$;
REVOKE ALL ON FUNCTION public.admin_manual_approve_pharmacy_payment(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_manual_approve_pharmacy_payment(uuid,uuid,text,text) TO service_role;

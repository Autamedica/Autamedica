-- Close cross-tenant RPC access in staging and match the production RPC contract.
CREATE OR REPLACE FUNCTION app_private.is_doctor_dispatch_approved(p_doctor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.doctors d
  WHERE d.id=p_doctor_id AND d.active IS TRUE AND d.care_country IN ('AR','BR')
   AND NULLIF(btrim(d.license_number),'') IS NOT NULL
   AND upper(btrim(d.license_number)) !~ '^PENDING'
   AND (
    (d.care_country='AR' AND d.license_type IN ('MN','MP')
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=d.user_id AND p.active IS TRUE AND p.sss_validation_status IN ('valid','exempt'))
     AND EXISTS (SELECT 1 FROM public.doctor_licenses l WHERE l.doctor_id=d.id AND l.status='active' AND l.license_type IN ('MN','MP')))
    OR
    (d.care_country='BR' AND d.license_type='CRM'
     AND EXISTS (SELECT 1 FROM public.doctor_licenses l WHERE l.doctor_id=d.id AND l.status='active' AND l.license_type='CRM' AND l.cfm_validation_status='valid'))
   )
 );
$$;
REVOKE ALL ON FUNCTION app_private.is_doctor_dispatch_approved(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_doctor_dispatch_approved(uuid) TO service_role;

-- Argument names are part of the PostgREST RPC contract. Drop/recreate is
-- required because PostgreSQL does not rename input arguments via OR REPLACE.
DROP FUNCTION public.claim_pharmacy_request_tier(uuid,uuid);
CREATE FUNCTION public.claim_pharmacy_request_tier(p_doctor_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_req RECORD; v_duty RECORD; v_resolved_doc_id uuid;
BEGIN
 SELECT id INTO v_resolved_doc_id FROM public.doctors
 WHERE id=p_doctor_id OR user_id=p_doctor_id LIMIT 1;
 IF v_resolved_doc_id IS NULL THEN v_resolved_doc_id:=p_doctor_id; END IF;

 IF auth.role() IS DISTINCT FROM 'service_role'
    AND (auth.uid() IS NULL OR (SELECT user_id FROM public.doctors WHERE id=v_resolved_doc_id) IS DISTINCT FROM auth.uid()) THEN
  RAISE EXCEPTION 'dispatch_doctor_identity_denied' USING ERRCODE='42501';
 END IF;

 SELECT * INTO v_duty FROM public.doctor_duty_status
 WHERE (doctor_id=v_resolved_doc_id OR doctor_id=p_doctor_id)
  AND is_on_duty IS TRUE AND last_heartbeat_at>pg_catalog.now()-INTERVAL '90 seconds'
 FOR UPDATE;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('success',false,'code','DOCTOR_NOT_ON_DUTY','message','Debes activar tu estado En Servicio para tomar consultas.');
 END IF;
 IF v_duty.current_active_request_id IS NOT NULL THEN
  RETURN jsonb_build_object('success',false,'code','DOCTOR_ALREADY_IN_CALL','message','Ya tienes una consulta activa en curso. Finalízala antes de aceptar otra.');
 END IF;

 SELECT * INTO v_req FROM public.pharmacy_dispatch_requests
 WHERE id=p_request_id AND status='searching'
  AND (search_timeout_at IS NULL OR search_timeout_at>pg_catalog.now())
 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN
  UPDATE public.pharmacy_dispatch_requests SET status='expired'
  WHERE id=p_request_id AND status='searching' AND search_timeout_at<=pg_catalog.now();
  RETURN jsonb_build_object('success',false,'code','REQUEST_ALREADY_CLAIMED_OR_EXPIRED','message','La consulta ya fue asignada a otro colega o expiró el SLA.');
 END IF;

 IF NOT EXISTS (SELECT 1 FROM public.doctors d
  WHERE d.id=v_resolved_doc_id AND d.active IS TRUE AND d.care_country=v_req.care_country
   AND app_private.is_doctor_dispatch_approved(d.id)
   AND NULLIF(btrim(d.license_number),'') IS NOT NULL
   AND upper(btrim(d.license_number)) !~ '^PENDING') THEN
  RETURN jsonb_build_object('success',false,'code','COUNTRY_OR_LICENSE_MISMATCH');
 END IF;
 IF v_duty.active_tiers IS NOT NULL AND pg_catalog.cardinality(v_duty.active_tiers)>0
  AND NOT (v_req.tier_requested=ANY(v_duty.active_tiers) OR 'general'=ANY(v_duty.active_tiers)) THEN
  RETURN jsonb_build_object('success',false,'code','TIER_MISMATCH','message','Esta consulta requiere una especialidad no configurada en tu guardia activa.');
 END IF;

 UPDATE public.pharmacy_dispatch_requests SET assigned_doctor_id=v_resolved_doc_id,status='matched',matched_at=pg_catalog.now() WHERE id=p_request_id;
 UPDATE public.doctor_duty_status SET current_active_request_id=p_request_id,updated_at=pg_catalog.now() WHERE doctor_id=v_duty.doctor_id;
 RETURN jsonb_build_object('success',true,'code','MATCH_SUCCESSFUL','request_id',v_req.id,'cloudflare_room_id',v_req.cloudflare_room_id,'patient_dni',v_req.patient_dni,'patient_phone',v_req.patient_phone,'tier_requested',v_req.tier_requested);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_pharmacy_request_tier(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_pharmacy_request_tier(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.set_doctor_duty_status(
 p_doctor_id uuid,p_is_on_duty boolean,
 p_active_tiers public.dispatch_tier_category[] DEFAULT '{general}'::public.dispatch_tier_category[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_doctor_id uuid;
BEGIN
 SELECT id INTO v_doctor_id FROM public.doctors WHERE id=p_doctor_id OR user_id=p_doctor_id LIMIT 1;
 IF v_doctor_id IS NULL THEN v_doctor_id:=p_doctor_id; END IF;
 IF auth.role() IS DISTINCT FROM 'service_role'
  AND (auth.uid() IS NULL OR (SELECT user_id FROM public.doctors WHERE id=v_doctor_id) IS DISTINCT FROM auth.uid()) THEN
  RAISE EXCEPTION 'doctor_duty_identity_denied' USING ERRCODE='42501';
 END IF;
 IF p_is_on_duty IS TRUE AND NOT app_private.is_doctor_dispatch_approved(v_doctor_id) THEN
  RAISE EXCEPTION 'DOCTOR_PENDING_CLINICAL_APPROVAL' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.doctor_duty_status(doctor_id,is_on_duty,active_tiers,duty_started_at,current_active_request_id,last_heartbeat_at,updated_at)
 VALUES(v_doctor_id,p_is_on_duty,p_active_tiers,CASE WHEN p_is_on_duty THEN pg_catalog.now() ELSE NULL END,NULL,pg_catalog.now(),pg_catalog.now())
 ON CONFLICT(doctor_id) DO UPDATE SET
  is_on_duty=EXCLUDED.is_on_duty,active_tiers=EXCLUDED.active_tiers,
  duty_started_at=CASE WHEN EXCLUDED.is_on_duty AND NOT public.doctor_duty_status.is_on_duty THEN pg_catalog.now()
                       WHEN NOT EXCLUDED.is_on_duty THEN NULL ELSE public.doctor_duty_status.duty_started_at END,
  current_active_request_id=CASE WHEN NOT EXCLUDED.is_on_duty THEN NULL ELSE public.doctor_duty_status.current_active_request_id END,
  last_heartbeat_at=pg_catalog.now(),updated_at=pg_catalog.now();
 RETURN jsonb_build_object('success',true,'doctor_id',v_doctor_id,'is_on_duty',p_is_on_duty,'active_tiers',p_active_tiers);
END;
$$;

CREATE OR REPLACE FUNCTION public.patient_health_reserve_get_balance(p_patient_id uuid DEFAULT NULL)
RETURNS TABLE(patient_id uuid,benefit_balance integer,max_cap_credits integer,status text,
 subscription_tier public.patient_subscription_tier,subscription_status public.patient_subscription_status)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_patient_id uuid; v_reserve public.patient_health_reserves; v_sub public.patient_subscriptions;
BEGIN
 IF p_patient_id IS NULL THEN
  SELECT p.id INTO v_patient_id FROM public.patients p WHERE p.user_id=(SELECT auth.uid()) LIMIT 1;
 ELSE v_patient_id:=p_patient_id; END IF;
 IF v_patient_id IS NULL THEN RETURN; END IF;
 IF COALESCE(auth.jwt()->>'role','')<>'service_role' AND NOT EXISTS(
  SELECT 1 FROM public.patients p WHERE p.id=v_patient_id AND p.user_id=(SELECT auth.uid())) THEN
  RAISE EXCEPTION 'health_reserve_access_denied' USING ERRCODE='42501';
 END IF;
 v_reserve:=public.ensure_patient_health_reserve(v_patient_id);
 SELECT * INTO v_sub FROM public.patient_subscriptions ps WHERE ps.patient_id=v_patient_id;
 patient_id:=v_patient_id; benefit_balance:=COALESCE(v_reserve.benefit_balance,0);
 max_cap_credits:=COALESCE(v_reserve.max_cap_credits,600); status:=COALESCE(v_reserve.status,'active');
 subscription_tier:=COALESCE(v_sub.tier,'free'::public.patient_subscription_tier);
 subscription_status:=COALESCE(v_sub.status,'active'::public.patient_subscription_status);
 RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.patient_wallet_get_balance(p_patient_id uuid DEFAULT NULL)
RETURNS TABLE(patient_id uuid,available_credit_cents bigint,locked_credit_cents bigint,total_credit_cents bigint,currency text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_patient_id uuid; v_wallet public.patient_wallets;
BEGIN
 IF p_patient_id IS NULL THEN
  SELECT p.id INTO v_patient_id FROM public.patients p WHERE p.user_id=auth.uid() LIMIT 1;
 ELSE v_patient_id:=p_patient_id; END IF;
 IF v_patient_id IS NULL THEN RETURN; END IF;
 IF COALESCE(auth.jwt()->>'role','')<>'service_role' THEN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.patients p WHERE p.id=v_patient_id AND p.user_id=auth.uid()) THEN
   RAISE EXCEPTION 'patient_wallet_access_denied' USING ERRCODE='42501';
  END IF;
 END IF;
 v_wallet:=public.ensure_patient_wallet(v_patient_id);
 patient_id:=v_patient_id; available_credit_cents:=v_wallet.available_credit_cents;
 locked_credit_cents:=v_wallet.locked_credit_cents;
 total_credit_cents:=v_wallet.available_credit_cents+v_wallet.locked_credit_cents;
 currency:=v_wallet.currency; RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_active_authorization(p_record_id uuid,p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid:=auth.uid(); v_service boolean:=COALESCE(auth.jwt()->>'role'='service_role',false);
BEGIN
 IF NOT v_service AND (v_uid IS NULL OR (p_user_id IS DISTINCT FROM v_uid AND NOT public.is_platform_or_org_admin(v_uid))) THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM public.medical_record_authorizations
  WHERE record_id=p_record_id AND authorized_user_id=p_user_id AND revoked_at IS NULL AND valid_until>pg_catalog.now());
END;
$$;

CREATE OR REPLACE FUNCTION public.community_group_allowed_for_patient(target_patient_id uuid,target_group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT COALESCE((SELECT groups.required_gender IS NULL OR patients.gender=groups.required_gender
  FROM public.community_groups groups JOIN public.patients patients
   ON patients.id=target_patient_id AND (patients.user_id=auth.uid() OR COALESCE(auth.jwt()->>'role','')='service_role')
  WHERE groups.id=target_group_id AND groups.deleted_at IS NULL),false);
$$;

CREATE OR REPLACE FUNCTION public.doctor_can_chat_with_patient(target_doctor_id uuid,target_patient_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid:=auth.uid(); v_service boolean:=COALESCE(auth.jwt()->>'role'='service_role',false); v_participant boolean;
BEGIN
 IF NOT v_service THEN
  IF v_uid IS NULL THEN RETURN false; END IF;
  SELECT EXISTS(SELECT 1 FROM public.doctors d WHERE d.id=target_doctor_id AND d.user_id=v_uid)
      OR EXISTS(SELECT 1 FROM public.patients p WHERE p.id=target_patient_id AND p.user_id=v_uid) INTO v_participant;
  IF NOT v_participant AND NOT public.is_platform_or_org_admin(v_uid) THEN RETURN false; END IF;
 END IF;
 RETURN EXISTS(SELECT 1 FROM public.patient_care_team pct WHERE pct.doctor_id=target_doctor_id AND pct.patient_id=target_patient_id AND pct.active IS TRUE)
     OR EXISTS(SELECT 1 FROM public.appointments a WHERE a.doctor_id=target_doctor_id AND a.patient_id=target_patient_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_in_care_team(p_doctor_id uuid,p_patient_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid:=auth.uid(); v_service boolean:=COALESCE(auth.jwt()->>'role'='service_role',false); v_participant boolean;
BEGIN
 IF NOT v_service THEN
  IF v_uid IS NULL THEN RETURN false; END IF;
  SELECT EXISTS(SELECT 1 FROM public.doctors d WHERE d.id=p_doctor_id AND d.user_id=v_uid)
      OR EXISTS(SELECT 1 FROM public.patients p WHERE p.id=p_patient_id AND p.user_id=v_uid) INTO v_participant;
  IF NOT v_participant AND NOT public.is_platform_or_org_admin(v_uid) THEN RETURN false; END IF;
 END IF;
 RETURN EXISTS(SELECT 1 FROM public.patient_care_team pct WHERE pct.doctor_id=p_doctor_id AND pct.patient_id=p_patient_id AND pct.active IS TRUE);
END;
$$;

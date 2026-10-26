-- RLS-bypassing reserve and care-team RPCs must check patient ownership and
-- doctor/appointment authority, not merely the supplied UUID or broad doctor role.
-- Applies without changing any patient financial balances or medical records.
CREATE OR REPLACE FUNCTION public.patient_health_reserve_get_balance(
  p_patient_id uuid DEFAULT NULL
)
RETURNS TABLE (
  patient_id uuid,
  benefit_balance integer,
  max_cap_credits integer,
  status text,
  subscription_tier public.patient_subscription_tier,
  subscription_status public.patient_subscription_status
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $reserve$
DECLARE
  v_patient_id uuid;
  v_reserve public.patient_health_reserves;
  v_sub public.patient_subscriptions;
BEGIN
  IF p_patient_id IS NULL THEN
    SELECT p.id INTO v_patient_id
    FROM public.patients p
    WHERE p.user_id = (SELECT auth.uid())
    LIMIT 1;
  ELSE
    v_patient_id := p_patient_id;
  END IF;

  IF v_patient_id IS NULL THEN
    RETURN;
  END IF;

  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' AND NOT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = v_patient_id AND p.user_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'health_reserve_access_denied' USING ERRCODE = '42501';
  END IF;

  v_reserve := public.ensure_patient_health_reserve(v_patient_id);

  SELECT * INTO v_sub FROM public.patient_subscriptions ps
  WHERE ps.patient_id = v_patient_id;

  patient_id := v_patient_id;
  benefit_balance := COALESCE(v_reserve.benefit_balance, 0);
  max_cap_credits := COALESCE(v_reserve.max_cap_credits, 600);
  status := COALESCE(v_reserve.status, 'active');
  subscription_tier := COALESCE(v_sub.tier, 'free'::public.patient_subscription_tier);
  subscription_status := COALESCE(v_sub.status, 'active'::public.patient_subscription_status);
  RETURN NEXT;
END;
$reserve$;

-- A client cannot create or discover another patient's reserve directly.
REVOKE EXECUTE ON FUNCTION public.ensure_patient_health_reserve(uuid)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_patient_health_reserve(uuid)
 TO service_role;

REVOKE EXECUTE ON FUNCTION public.patient_health_reserve_get_balance(uuid)
 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_health_reserve_get_balance(uuid)
 TO authenticated, service_role;

-- "is_doctor()" alone allowed a doctor to remove unrelated practitioners
-- from any patient's care team. Require their own doctor_id and an existing
-- independently authorized appointment, or the designated system admin.
CREATE OR REPLACE FUNCTION public.remove_from_care_team(
  p_doctor_id uuid,
  p_patient_id uuid,
  p_role text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $care$
DECLARE
  v_updated_count integer;
BEGIN
  IF NOT (
    COALESCE(public.is_system_admin(), false)
    OR COALESCE(public.can_self_assign_care_team(p_doctor_id,p_patient_id), false)
  ) THEN
    RAISE EXCEPTION 'care_team_removal_access_denied' USING ERRCODE = '42501';
  END IF;

  IF p_role IS NULL THEN
    UPDATE public.patient_care_team
      SET active = false, updated_at = NOW()
      WHERE doctor_id = p_doctor_id AND patient_id = p_patient_id;
  ELSE
    UPDATE public.patient_care_team
      SET active = false, updated_at = NOW()
      WHERE doctor_id = p_doctor_id AND patient_id = p_patient_id
        AND role = p_role;
  END IF;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count > 0;
END;
$care$;

REVOKE EXECUTE ON FUNCTION public.remove_from_care_team(uuid,uuid,text)
 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_from_care_team(uuid,uuid,text)
 TO authenticated, service_role;

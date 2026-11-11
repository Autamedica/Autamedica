-- Enforce physician ownership for care-team mutations; admins may manage only
-- active doctors with a non-provisional credential.
CREATE OR REPLACE FUNCTION public.can_self_assign_care_team(p_doctor_id uuid,p_patient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.doctors d
  JOIN public.appointments a ON a.doctor_id=d.id AND a.patient_id=p_patient_id
   AND a.deleted_at IS NULL AND a.status::text IN ('scheduled','confirmed','in_progress','completed')
  WHERE d.id=p_doctor_id AND d.user_id=(SELECT auth.uid()) AND d.active IS TRUE
   AND NULLIF(btrim(d.license_number),'') IS NOT NULL
   AND upper(btrim(d.license_number)) !~ '^PENDING'
 );
$$;
REVOKE ALL ON FUNCTION public.can_self_assign_care_team(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_self_assign_care_team(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.add_to_care_team(
 p_doctor_id uuid,p_patient_id uuid,p_role text DEFAULT 'primary_doctor',p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_assignment_id uuid; v_role text;
BEGIN
 IF NOT (
  public.can_self_assign_care_team(p_doctor_id,p_patient_id)
  OR (public.is_system_admin() AND EXISTS (
    SELECT 1 FROM public.doctors d WHERE d.id=p_doctor_id AND d.active IS TRUE
     AND NULLIF(btrim(d.license_number),'') IS NOT NULL
     AND upper(btrim(d.license_number)) !~ '^PENDING'
  ))
 ) THEN
  RAISE EXCEPTION 'care_team_access_denied' USING ERRCODE='42501';
 END IF;
 PERFORM NULLIF(btrim(COALESCE(p_notes,'')),'');
 v_role:=CASE COALESCE(p_role,'primary')
  WHEN 'primary_doctor' THEN 'primary' WHEN 'primary' THEN 'primary'
  WHEN 'specialist' THEN 'specialist' WHEN 'consultant' THEN 'consultant'
  ELSE 'consultant' END;
 INSERT INTO public.patient_care_team(doctor_id,patient_id,role,assigned_date,active)
 VALUES(p_doctor_id,p_patient_id,v_role,CURRENT_DATE,true)
 ON CONFLICT(patient_id,doctor_id)
 DO UPDATE SET role=EXCLUDED.role,assigned_date=CURRENT_DATE,active=true,updated_at=pg_catalog.now()
 RETURNING id INTO v_assignment_id;
 RETURN v_assignment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_from_care_team(
 p_doctor_id uuid,p_patient_id uuid,p_role text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_updated_count integer;
BEGIN
 IF NOT (COALESCE(public.is_system_admin(),false)
         OR COALESCE(public.can_self_assign_care_team(p_doctor_id,p_patient_id),false)) THEN
  RAISE EXCEPTION 'care_team_removal_access_denied' USING ERRCODE='42501';
 END IF;
 IF p_role IS NULL THEN
  UPDATE public.patient_care_team SET active=false,updated_at=pg_catalog.now()
   WHERE doctor_id=p_doctor_id AND patient_id=p_patient_id;
 ELSE
  UPDATE public.patient_care_team SET active=false,updated_at=pg_catalog.now()
   WHERE doctor_id=p_doctor_id AND patient_id=p_patient_id AND role=p_role;
 END IF;
 GET DIAGNOSTICS v_updated_count=ROW_COUNT;
 RETURN v_updated_count>0;
END;
$$;

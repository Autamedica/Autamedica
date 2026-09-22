-- Permite al doctor acceder al historial y emitir evoluciones medicas/recetas para pacientes de guardia on-demand (pharmacy_dispatch_requests)
CREATE OR REPLACE FUNCTION public.doctor_has_patient_access(patient_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_doctor_id uuid;
  v_patient_id uuid;
BEGIN
  -- Verificar que el usuario actual es doctor
  IF NOT public.is_doctor() THEN
    RETURN false;
  END IF;

  -- Obtener ID del doctor actual
  SELECT id INTO v_doctor_id
  FROM public.doctors
  WHERE user_id = auth.uid() AND active = true;

  -- Obtener ID del paciente
  SELECT id INTO v_patient_id
  FROM public.patients
  WHERE user_id = patient_user_id AND active = true;

  IF v_doctor_id IS NULL OR v_patient_id IS NULL THEN
    RETURN false;
  END IF;

  -- Verificar si existe relacion en alguna de las 4 fuentes de verdad
  RETURN EXISTS (
    -- 1. Care Team (Relacion formal)
    SELECT 1 FROM public.patient_care_team
    WHERE doctor_id = v_doctor_id AND patient_id = v_patient_id AND active = true
    UNION ALL
    -- 2. Doctor Patient (Relacion automatica por citas)
    SELECT 1 FROM public.doctor_patient
    WHERE doctor_id = v_doctor_id AND patient_id = v_patient_id
    UNION ALL
    -- 3. Appointments (Citas directas)
    SELECT 1 FROM public.appointments
    WHERE doctor_id = v_doctor_id AND patient_id = v_patient_id AND deleted_at IS NULL
    UNION ALL
    -- 4. Pharmacy on-demand dispatch requests
    SELECT 1 FROM public.pharmacy_dispatch_requests
    WHERE (assigned_doctor_id = v_doctor_id OR previous_doctor_id = v_doctor_id)
      AND (
        requested_by_user_id = patient_user_id
        OR requested_by_user_id = (SELECT user_id FROM public.patients WHERE id = v_patient_id)
        OR (patient_dni IS NOT NULL AND patient_dni = (SELECT dni FROM public.patients WHERE id = v_patient_id))
      )
  );
END;
$function$;

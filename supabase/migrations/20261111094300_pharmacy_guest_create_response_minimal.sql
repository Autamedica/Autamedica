CREATE OR REPLACE FUNCTION public.create_pharmacy_consultation_request(
  p_pharmacy_id uuid,
  p_pharmacy_name text,
  p_patient_dni text,
  p_patient_name text,
  p_patient_phone text,
  p_reason text,
  p_care_country text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_row public.pharmacy_consultation_requests;
  v_pharmacy_name text;
  v_country text;
  v_phone_digits text;
BEGIN
  IF NULLIF(btrim(p_patient_dni),'') IS NULL
     OR NULLIF(btrim(p_patient_name),'') IS NULL
     OR NULLIF(btrim(p_patient_phone),'') IS NULL
     OR NULLIF(btrim(p_reason),'') IS NULL
     OR length(p_patient_dni)>32
     OR length(p_patient_name)>120
     OR length(p_patient_phone)>32
     OR length(p_reason)>1000
     OR length(COALESCE(p_pharmacy_name,''))>160 THEN
    RAISE EXCEPTION 'invalid_pharmacy_request_payload' USING ERRCODE='22023';
  END IF;

  v_phone_digits:=pg_catalog.regexp_replace(COALESCE(p_patient_phone,''),'\D','','g');
  v_country:=upper(COALESCE(NULLIF(btrim(p_care_country),''),
    CASE WHEN v_phone_digits LIKE '55%' THEN 'BR'
         WHEN v_phone_digits LIKE '598%' THEN 'UY'
         WHEN v_phone_digits LIKE '54%' THEN 'AR'
         ELSE 'AR' END));
  IF length(v_country)<>2 THEN
    RAISE EXCEPTION 'invalid_care_country' USING ERRCODE='22023';
  END IF;

  IF p_pharmacy_id IS NOT NULL THEN
    SELECT ph.name INTO v_pharmacy_name FROM public.pharmacies ph WHERE ph.id=p_pharmacy_id;
  END IF;
  v_pharmacy_name:=COALESCE(NULLIF(btrim(v_pharmacy_name),''),NULLIF(btrim(p_pharmacy_name),''),'Farmacia');

  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pharmacy_consultation_requests' AND column_name='care_country') THEN
    EXECUTE
      'INSERT INTO public.pharmacy_consultation_requests
       (pharmacy_id,pharmacy_name,patient_dni,patient_name,patient_phone,reason,status,care_country)
       VALUES ($1,$2,$3,$4,$5,$6,''pending'',$7) RETURNING *'
    INTO v_row
    USING p_pharmacy_id,v_pharmacy_name,btrim(p_patient_dni),btrim(p_patient_name),
      btrim(p_patient_phone),btrim(p_reason),v_country;
  ELSE
    INSERT INTO public.pharmacy_consultation_requests(
      pharmacy_id,pharmacy_name,patient_dni,patient_name,patient_phone,reason,status
    ) VALUES (
      p_pharmacy_id,v_pharmacy_name,btrim(p_patient_dni),btrim(p_patient_name),
      btrim(p_patient_phone),btrim(p_reason),'pending'
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'id',v_row.id,'pharmacy_id',v_row.pharmacy_id,'pharmacy_name',v_row.pharmacy_name,
    'patient_dni',v_row.patient_dni,'patient_name',v_row.patient_name,
    'patient_phone',v_row.patient_phone,'reason',v_row.reason,'status',v_row.status,
    'doctor_id',v_row.doctor_id,'call_id',v_row.call_id,'room_id',v_row.room_id,
    'guest_invite_id',v_row.guest_invite_id,'created_at',v_row.created_at
  );
END;
$function$;

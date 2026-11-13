-- Restrict guest pharmacy request table access and move patient operations to
-- capability-based RPCs keyed by the unguessable request UUID.
ALTER TABLE public.pharmacy_consultation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_insert_pharmacy_requests" ON public.pharmacy_consultation_requests;
DROP POLICY IF EXISTS "allow_select_own_pharmacy_request" ON public.pharmacy_consultation_requests;
DROP POLICY IF EXISTS "doctors_update_pharmacy_requests" ON public.pharmacy_consultation_requests;
DROP POLICY IF EXISTS "pharmacy_consultation_requests_select_confined" ON public.pharmacy_consultation_requests;
DROP POLICY IF EXISTS "pharmacy_consultation_requests_update_confined" ON public.pharmacy_consultation_requests;

CREATE POLICY "pharmacy_consultation_requests_select_confined"
  ON public.pharmacy_consultation_requests
  FOR SELECT TO authenticated, service_role
  USING (
    auth.role()='service_role'
    OR doctor_id=auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id=pharmacy_consultation_requests.doctor_id
        AND d.user_id=auth.uid()
    )
    OR (
      status='pending'
      AND EXISTS (
        SELECT 1 FROM public.doctor_duty_status dds
        JOIN public.doctors d ON d.id=dds.doctor_id
        WHERE (dds.doctor_id=auth.uid() OR d.user_id=auth.uid())
          AND dds.is_on_duty IS TRUE
          AND dds.last_heartbeat_at > (pg_catalog.now()-INTERVAL '90 seconds')
      )
    )
  );

CREATE POLICY "pharmacy_consultation_requests_update_confined"
  ON public.pharmacy_consultation_requests
  FOR UPDATE TO authenticated, service_role
  USING (
    auth.role()='service_role'
    OR doctor_id=auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id=pharmacy_consultation_requests.doctor_id
        AND d.user_id=auth.uid()
    )
    OR (
      status='pending'
      AND EXISTS (
        SELECT 1 FROM public.doctor_duty_status dds
        JOIN public.doctors d ON d.id=dds.doctor_id
        WHERE (dds.doctor_id=auth.uid() OR d.user_id=auth.uid())
          AND dds.is_on_duty IS TRUE
          AND dds.last_heartbeat_at > (pg_catalog.now()-INTERVAL '90 seconds')
      )
    )
  )
  WITH CHECK (
    auth.role()='service_role'
    OR EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id=pharmacy_consultation_requests.doctor_id
        AND d.user_id=auth.uid()
    )
  );

REVOKE ALL ON TABLE public.pharmacy_consultation_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE ON TABLE public.pharmacy_consultation_requests TO authenticated;
GRANT ALL ON TABLE public.pharmacy_consultation_requests TO service_role;

-- The captive portal writes leads with service_role only. The original policy
-- accidentally targeted PUBLIC despite its name.
DROP POLICY IF EXISTS "Service role full access on wifi_leads" ON public.wifi_leads;
CREATE POLICY "Service role full access on wifi_leads"
  ON public.wifi_leads
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.wifi_leads FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.wifi_leads TO service_role;

CREATE OR REPLACE FUNCTION public.create_pharmacy_consultation_request(
  p_pharmacy_id uuid,
  p_pharmacy_name text,
  p_patient_dni text,
  p_patient_name text,
  p_patient_phone text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_row public.pharmacy_consultation_requests;
  v_pharmacy_name text;
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

  IF p_pharmacy_id IS NOT NULL THEN
    SELECT ph.name INTO v_pharmacy_name
    FROM public.pharmacies ph WHERE ph.id=p_pharmacy_id;
  END IF;
  v_pharmacy_name:=COALESCE(NULLIF(btrim(v_pharmacy_name),''),NULLIF(btrim(p_pharmacy_name),''),'Farmacia');

  INSERT INTO public.pharmacy_consultation_requests(
    pharmacy_id,pharmacy_name,patient_dni,patient_name,patient_phone,reason,status
  ) VALUES (
    p_pharmacy_id,v_pharmacy_name,btrim(p_patient_dni),btrim(p_patient_name),
    btrim(p_patient_phone),btrim(p_reason),'pending'
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id',v_row.id,'pharmacy_id',v_row.pharmacy_id,'pharmacy_name',v_row.pharmacy_name,
    'patient_dni',v_row.patient_dni,'patient_name',v_row.patient_name,
    'patient_phone',v_row.patient_phone,'reason',v_row.reason,'status',v_row.status,
    'doctor_id',v_row.doctor_id,'call_id',v_row.call_id,'room_id',v_row.room_id,
    'guest_invite_id',v_row.guest_invite_id,'created_at',v_row.created_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_pharmacy_consultation_request_status(p_request_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT jsonb_build_object(
    'found',true,
    'id',r.id,
    'status',r.status,
    'queue_position',CASE WHEN r.status='pending' THEN (
      SELECT count(*)::integer FROM public.pharmacy_consultation_requests q
      WHERE q.status='pending' AND q.created_at<=r.created_at
    ) ELSE 0 END,
    'pharmacy_name',r.pharmacy_name,
    'patient_name',r.patient_name,
    'reason',r.reason,
    'room_id',r.room_id,
    'guest_invite_id',r.guest_invite_id,
    'created_at',r.created_at,
    'assigned_at',r.assigned_at,
    'doctor_name',CASE
      WHEN r.doctor_id IS NULL THEN NULL
      WHEN NULLIF(btrim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')),'') IS NULL THEN 'Médico de Guardia'
      ELSE 'Dr. '||btrim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,''))
    END,
    'doctor_specialty',d.specialty
  )
  FROM public.pharmacy_consultation_requests r
  LEFT JOIN public.doctors d ON d.id=r.doctor_id
  LEFT JOIN public.profiles p ON p.user_id=d.user_id
  WHERE r.id=p_request_id
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_pharmacy_consultation_request(
  p_request_id uuid,p_reason text DEFAULT 'cancelled_by_user'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_updated integer;
BEGIN
  UPDATE public.pharmacy_consultation_requests
  SET status='cancelled',
      metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{cancellation_reason}',
        to_jsonb(left(COALESCE(NULLIF(btrim(p_reason),''),'cancelled_by_user'),80)))
  WHERE id=p_request_id AND status='pending';
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  IF v_updated=0 THEN
    RETURN jsonb_build_object('success',false,'error','request_not_found_or_not_pending');
  END IF;
  RETURN jsonb_build_object('success',true,'request_id',p_request_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_pharmacy_consultation_request(uuid,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pharmacy_consultation_request_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_pharmacy_consultation_request(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pharmacy_consultation_request(uuid,text,text,text,text,text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_pharmacy_consultation_request_status(uuid) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cancel_pharmacy_consultation_request(uuid,text) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_pharmacy_consultation_request_status(p_request_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT COALESCE((
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
    LIMIT 1
  ),jsonb_build_object('found',false));
$function$;

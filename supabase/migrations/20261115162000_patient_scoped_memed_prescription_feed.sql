-- Patient-scoped read path for Memed records.
-- The source table remains inaccessible to anon/authenticated roles; this
-- SECURITY DEFINER RPC returns only the row belonging to auth.uid().
CREATE OR REPLACE FUNCTION public.patient_memed_prescriptions_get()
RETURNS TABLE (
  id uuid,
  doctor_id uuid,
  patient_id uuid,
  memed_id text,
  status text,
  provider_data jsonb,
  digital_link_data jsonb,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT mp.id, mp.doctor_id, mp.patient_id, mp.memed_id, mp.status,
         mp.provider_data, mp.digital_link_data, mp.created_at
  FROM public.memed_prescriptions mp
  WHERE mp.patient_id = (
    SELECT p.id FROM public.patients p
    WHERE p.user_id = auth.uid()
    LIMIT 1
  )
    AND mp.status <> 'deleted'
  ORDER BY mp.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.patient_memed_prescriptions_get() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_memed_prescriptions_get() TO authenticated;

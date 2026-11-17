-- Independent authenticated doctor presence; never used as clinical eligibility.
BEGIN;

CREATE TABLE IF NOT EXISTS public.doctor_presence (
  doctor_id uuid PRIMARY KEY REFERENCES public.doctors(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS doctor_presence_last_seen_idx
  ON public.doctor_presence (last_seen_at DESC);

ALTER TABLE public.doctor_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.doctor_presence FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.doctor_presence TO service_role;

CREATE OR REPLACE FUNCTION public.heartbeat_my_doctor_presence()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $presence$
DECLARE
  v_user_id uuid := auth.uid();
  v_doctor_id uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT d.id
    INTO v_doctor_id
  FROM public.doctors d
  JOIN public.profiles p ON p.user_id = d.user_id
  WHERE d.user_id = v_user_id
    AND d.active IS TRUE
    AND p.active IS TRUE
    AND p.role = 'doctor'
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_doctor_id IS NULL THEN
    RAISE EXCEPTION 'active_doctor_profile_required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.doctor_presence (doctor_id, user_id, last_seen_at)
  VALUES (v_doctor_id, v_user_id, v_now)
  ON CONFLICT (doctor_id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        last_seen_at = EXCLUDED.last_seen_at;

  RETURN jsonb_build_object(
    'online', true,
    'last_seen_at', v_now
  );
END;
$presence$;

REVOKE ALL ON FUNCTION public.heartbeat_my_doctor_presence() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.heartbeat_my_doctor_presence() TO authenticated, service_role;

COMMIT;

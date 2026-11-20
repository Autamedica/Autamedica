-- Persist doctor-created eventual patients without creating auth.users identities.
-- Identity and consent data stay in a backend-only table; patients contains only
-- the clinical chart id, care market and consent state required by existing gates.
BEGIN;

CREATE TABLE IF NOT EXISTS public.patient_private_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
  care_country text NOT NULL CHECK (care_country IN ('AR', 'BR')),
  document_type text NOT NULL CHECK (document_type IN ('DNI', 'CPF')),
  document_number text NOT NULL,
  full_name text NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 3 AND 200),
  birth_date date NOT NULL,
  gender text,
  phone text,
  email text,
  consent_at timestamptz NOT NULL DEFAULT now(),
  consent_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  consent_scope text NOT NULL CHECK (consent_scope = 'prescription_issuance_and_delivery'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_private_identity_country_document_check
    CHECK ((care_country = 'BR' AND document_type = 'CPF')
        OR (care_country = 'AR' AND document_type = 'DNI')),
  CONSTRAINT patient_private_identity_gender_check
    CHECK (gender IS NULL OR gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
  CONSTRAINT patient_private_identity_contact_check
    CHECK (phone IS NULL OR phone ~ '^\+?[0-9]{6,20}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS patient_private_identities_doctor_document_uidx
  ON public.patient_private_identities (doctor_id, care_country, document_type, document_number);
CREATE INDEX IF NOT EXISTS patient_private_identities_patient_doctor_idx
  ON public.patient_private_identities (patient_id, doctor_id);

ALTER TABLE public.patient_private_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_private_identities FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.patient_private_identities FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.patient_private_identities TO service_role;
DROP POLICY IF EXISTS patient_private_identities_service_role_only
  ON public.patient_private_identities;
CREATE POLICY patient_private_identities_service_role_only
  ON public.patient_private_identities
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.create_doctor_eventual_patient(
  p_doctor_id uuid,
  p_care_country text,
  p_full_name text,
  p_document_type text,
  p_document_number text,
  p_birth_date date,
  p_gender text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_consent_scope text DEFAULT 'prescription_issuance_and_delivery'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_doctor_user_id uuid;
  v_doctor_country text;
  v_document text;
  v_document_type text;
  v_name text;
  v_gender text;
  v_phone text;
  v_email text;
  v_patient_id uuid;
  v_reused boolean := false;
  v_sum integer;
  v_digit integer;
  v_idx integer;
  v_len integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'eventual_patient_backend_only' USING ERRCODE = '42501';
  END IF;

  SELECT d.user_id, d.care_country
    INTO v_doctor_user_id, v_doctor_country
  FROM public.doctors d
  WHERE d.id = p_doctor_id AND d.active IS TRUE;

  IF NOT FOUND OR v_doctor_country IS DISTINCT FROM p_care_country
     OR p_care_country NOT IN ('AR', 'BR') THEN
    RAISE EXCEPTION 'eventual_patient_doctor_country_invalid' USING ERRCODE = '22023';
  END IF;
  IF v_doctor_user_id IS NULL THEN
    RAISE EXCEPTION 'eventual_patient_doctor_identity_missing' USING ERRCODE = '42501';
  END IF;

  v_name := regexp_replace(btrim(COALESCE(p_full_name, '')), '\s+', ' ', 'g');
  IF char_length(v_name) < 3 OR char_length(v_name) > 200
     OR array_length(string_to_array(v_name, ' '), 1) < 2 THEN
    RAISE EXCEPTION 'eventual_patient_name_invalid' USING ERRCODE = '22023';
  END IF;

  v_document := regexp_replace(COALESCE(p_document_number, ''), '[^0-9]', '', 'g');
  v_document_type := upper(btrim(COALESCE(p_document_type, '')));
  IF p_care_country = 'AR' THEN
    IF v_document_type <> 'DNI' OR v_document !~ '^[0-9]{7,8}$' THEN
      RAISE EXCEPTION 'eventual_patient_dni_invalid' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF v_document_type <> 'CPF' OR v_document !~ '^[0-9]{11}$'
       OR v_document = repeat(substr(v_document, 1, 1), 11) THEN
      RAISE EXCEPTION 'eventual_patient_cpf_invalid' USING ERRCODE = '22023';
    END IF;
    FOR v_len IN 9..10 LOOP
      v_sum := 0;
      FOR v_idx IN 1..v_len LOOP
        v_sum := v_sum + substr(v_document, v_idx, 1)::integer * (v_len + 1 - v_idx);
      END LOOP;
      v_digit := mod(v_sum * 10, 11);
      IF v_digit = 10 THEN v_digit := 0; END IF;
      IF v_digit <> substr(v_document, v_len + 1, 1)::integer THEN
        RAISE EXCEPTION 'eventual_patient_cpf_invalid' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  IF p_birth_date IS NULL OR p_birth_date < DATE '1900-01-01' OR p_birth_date >= CURRENT_DATE + 1 THEN
    RAISE EXCEPTION 'eventual_patient_birth_date_invalid' USING ERRCODE = '22023';
  END IF;
  v_gender := NULLIF(lower(btrim(COALESCE(p_gender, ''))), '');
  IF p_care_country = 'BR' AND (v_gender IS NULL OR v_gender NOT IN ('male', 'female')) THEN
    RAISE EXCEPTION 'eventual_patient_gender_required' USING ERRCODE = '22023';
  END IF;
  IF v_gender IS NOT NULL AND v_gender NOT IN ('male', 'female', 'other', 'prefer_not_to_say') THEN
    RAISE EXCEPTION 'eventual_patient_gender_invalid' USING ERRCODE = '22023';
  END IF;
  v_phone := NULLIF(regexp_replace(COALESCE(p_phone, ''), '[^0-9+]', '', 'g'), '');
  v_email := NULLIF(btrim(COALESCE(p_email, '')), '');
  IF v_phone IS NOT NULL AND v_phone !~ '^\+?[0-9]{6,20}$' THEN
    RAISE EXCEPTION 'eventual_patient_contact_invalid' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'eventual_patient_contact_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_consent_scope IS DISTINCT FROM 'prescription_issuance_and_delivery' THEN
    RAISE EXCEPTION 'eventual_patient_consent_required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_doctor_id::text || ':' || p_care_country || ':' || v_document_type || ':' || v_document, 0)
  );

  -- First reuse this doctor's existing eventual record.
  SELECT pi.patient_id INTO v_patient_id
  FROM public.patient_private_identities pi
  JOIN public.patients p ON p.id = pi.patient_id AND p.active IS TRUE
  WHERE pi.doctor_id = p_doctor_id
    AND pi.care_country = p_care_country
    AND pi.document_type = v_document_type
    AND pi.document_number = v_document
  LIMIT 1;

  -- Then reuse a same-document chart that is already in this doctor's care scope.
  IF v_patient_id IS NULL THEN
    SELECT p.id INTO v_patient_id
    FROM public.patients p
    WHERE p.active IS TRUE
      AND p.care_country = p_care_country
      AND ((v_document_type = 'CPF' AND regexp_replace(COALESCE(p.cpf, ''), '[^0-9]', '', 'g') = v_document)
        OR (v_document_type = 'DNI' AND regexp_replace(COALESCE(p.dni, ''), '[^0-9]', '', 'g') = v_document))
      AND (
        EXISTS (SELECT 1 FROM public.patient_care_team pct
                WHERE pct.patient_id = p.id AND pct.doctor_id = p_doctor_id AND pct.active IS TRUE)
        OR EXISTS (SELECT 1 FROM public.appointments a
                   WHERE a.patient_id = p.id AND a.doctor_id = p_doctor_id
                     AND a.deleted_at IS NULL AND a.status::text IN ('scheduled','confirmed','in_progress','completed'))
      )
    ORDER BY p.created_at DESC
    LIMIT 1;
  END IF;

  IF v_patient_id IS NOT NULL THEN
    v_reused := true;
  ELSE
    INSERT INTO public.patients (
      user_id, care_country, active, lgpd_consent, lgpd_consent_date, timezone
    ) VALUES (
      NULL, p_care_country, TRUE, TRUE, pg_catalog.now(),
      CASE WHEN p_care_country = 'BR' THEN 'America/Sao_Paulo'
           ELSE 'America/Argentina/Buenos_Aires' END
    )
    RETURNING id INTO v_patient_id;
  END IF;

  INSERT INTO public.patient_care_team (patient_id, doctor_id, role, assigned_date, active)
  VALUES (v_patient_id, p_doctor_id, 'primary', CURRENT_DATE, TRUE)
  ON CONFLICT (patient_id, doctor_id)
  DO UPDATE SET active = TRUE, assigned_date = CURRENT_DATE, updated_at = pg_catalog.now();

  INSERT INTO public.patient_private_identities (
    patient_id, doctor_id, care_country, document_type, document_number,
    full_name, birth_date, gender, phone, email, consent_at, consent_by,
    consent_scope, updated_at
  ) VALUES (
    v_patient_id, p_doctor_id, p_care_country, v_document_type, v_document,
    v_name, p_birth_date, v_gender, v_phone, v_email, pg_catalog.now(),
    v_doctor_user_id, 'prescription_issuance_and_delivery', pg_catalog.now()
  )
  ON CONFLICT (doctor_id, care_country, document_type, document_number)
  DO UPDATE SET
    patient_id = EXCLUDED.patient_id,
    full_name = EXCLUDED.full_name,
    birth_date = EXCLUDED.birth_date,
    gender = EXCLUDED.gender,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    consent_at = EXCLUDED.consent_at,
    consent_by = EXCLUDED.consent_by,
    consent_scope = EXCLUDED.consent_scope,
    updated_at = EXCLUDED.updated_at
  RETURNING patient_id INTO v_patient_id;

  RETURN pg_catalog.jsonb_build_object('patient_id', v_patient_id, 'reused', v_reused);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_doctor_eventual_patient(
  uuid, text, text, text, text, date, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_doctor_eventual_patient(
  uuid, text, text, text, text, date, text, text, text, text
) TO service_role;

COMMENT ON TABLE public.patient_private_identities IS
  'Server-only clinical identity and consent for doctor-created eventual patients; never exposed to patient-facing clients.';

COMMIT;

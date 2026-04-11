-- Fix pharmacist onboarding: allow NULL for columns that are filled post-signup
-- and update handle_new_user to create pharmacist record instead of patient placeholder.

ALTER TABLE public.pharmacists ALTER COLUMN pharmacy_id DROP NOT NULL;
ALTER TABLE public.pharmacists ALTER COLUMN license_number DROP NOT NULL;
ALTER TABLE public.pharmacists ALTER COLUMN license_province DROP NOT NULL;
ALTER TABLE public.pharmacists ALTER COLUMN full_name DROP NOT NULL;

-- Recreate handle_new_user with correct pharmacist handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  role_raw   text;
  role_value public.user_role;
  cols_sql   text := 'user_id, email, role, first_name, last_name';
  values_sql text;
BEGIN
  role_raw := COALESCE(
    NEW.raw_user_meta_data ->> 'role',
    NEW.raw_user_meta_data ->> 'user_role',
    'patient'
  );

  role_value := CASE role_raw
    WHEN 'doctor'     THEN 'doctor'::public.user_role
    WHEN 'pharmacist' THEN 'pharmacist'::public.user_role
    WHEN 'company'    THEN 'company_admin'::public.user_role
    WHEN 'admin'      THEN 'platform_admin'::public.user_role
    ELSE 'patient'::public.user_role
  END;

  values_sql := format(
    '%L, %L, %L, %L, %L',
    NEW.id,
    COALESCE(NEW.email, NEW.raw_user_meta_data ->> 'email'),
    role_value,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', '')
  );

  IF NEW.raw_user_meta_data ? 'phone' THEN
    cols_sql   := cols_sql || ', phone';
    values_sql := values_sql || format(', %L', NULLIF(NEW.raw_user_meta_data ->> 'phone', ''));
  END IF;

  EXECUTE format(
    'INSERT INTO public.profiles (%s) VALUES (%s) ON CONFLICT (user_id) DO NOTHING',
    cols_sql, values_sql
  );

  CASE role_value
    WHEN 'doctor' THEN
      INSERT INTO public.doctors (user_id, license_number, specialty)
      VALUES (NEW.id, 'PENDING', 'General')
      ON CONFLICT DO NOTHING;

    WHEN 'patient' THEN
      INSERT INTO public.patients (user_id)
      VALUES (NEW.id)
      ON CONFLICT DO NOTHING;

    WHEN 'pharmacist' THEN
      INSERT INTO public.pharmacists (user_id)
      VALUES (NEW.id)
      ON CONFLICT DO NOTHING;

    WHEN 'company_admin' THEN
      NULL;

    WHEN 'platform_admin' THEN
      NULL;

    ELSE
      INSERT INTO public.patients (user_id)
      VALUES (NEW.id)
      ON CONFLICT DO NOTHING;
  END CASE;

  RETURN NEW;
END;
$$;

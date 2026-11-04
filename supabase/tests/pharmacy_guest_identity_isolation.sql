-- Disposable database only: guest requests must never reuse a chart by DNI/CPF.
-- Uses a transaction so even successful fixtures are rolled back.
BEGIN;
DO $guard$
BEGIN
  IF current_setting('autamedica.isolated_test', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'isolated_test must be on';
  END IF;
END $guard$;

DO $test$
DECLARE
  historical_ar uuid;
  historical_br uuid;
  isolated_ar uuid;
  isolated_br uuid;
  guest record;
BEGIN
  INSERT INTO public.patients(dni, care_country, active)
  VALUES ('00000001', 'AR', true)
  RETURNING id INTO historical_ar;

  INSERT INTO public.patients(cpf, care_country, active)
  VALUES ('99900011199', 'BR', true)
  RETURNING id INTO historical_br;

  INSERT INTO public.pharmacy_dispatch_requests(
    patient_dni, patient_phone, patient_name, tier_requested,
    care_country, cloudflare_room_id, status, requested_by_user_id
  ) VALUES (
    '00000001', '+9999999999', 'TEST GUEST AR', 'general',
    'AR', 'cf-room-guest-isolation-ar-ci', 'searching', NULL
  ) RETURNING patient_id INTO isolated_ar;

  INSERT INTO public.pharmacy_dispatch_requests(
    patient_cpf, patient_phone, patient_name, tier_requested,
    care_country, cloudflare_room_id, status, requested_by_user_id
  ) VALUES (
    '99900011199', '+9999999998', 'TEST GUEST BR', 'general',
    'BR', 'cf-room-guest-isolation-br-ci', 'searching', NULL
  ) RETURNING patient_id INTO isolated_br;

  IF isolated_ar IS NULL OR isolated_br IS NULL
    OR isolated_ar=historical_ar OR isolated_br=historical_br
    OR isolated_ar=isolated_br
  THEN RAISE EXCEPTION 'Guest dispatch reused historic patient identity'; END IF;

  SELECT p.dni, p.cpf, p.user_id, p.care_country INTO guest
  FROM public.patients p WHERE p.id=isolated_ar;
  IF guest.dni IS NOT NULL OR guest.cpf IS NOT NULL
      OR guest.user_id IS NOT NULL OR guest.care_country IS DISTINCT FROM 'AR'
  THEN RAISE EXCEPTION 'AR guest isolated record contains historical identity'; END IF;

  SELECT p.dni, p.cpf, p.user_id, p.care_country INTO guest
  FROM public.patients p WHERE p.id=isolated_br;
  IF guest.dni IS NOT NULL OR guest.cpf IS NOT NULL
      OR guest.user_id IS NOT NULL OR guest.care_country IS DISTINCT FROM 'BR'
  THEN RAISE EXCEPTION 'BR guest isolated record contains historical identity'; END IF;

  IF (SELECT dni FROM public.patients WHERE id=historical_ar) IS DISTINCT FROM '00000001'
    OR (SELECT cpf FROM public.patients WHERE id=historical_br) IS DISTINCT FROM '99900011199'
  THEN RAISE EXCEPTION 'Guest changed an existing patient chart'; END IF;

  IF has_table_privilege('anon','public.pharmacy_dispatch_requests','INSERT') THEN
    RAISE EXCEPTION 'Anonymous direct dispatch inserts must not be granted';
  END IF;
  RAISE NOTICE 'PASS AR/BR guest charts isolated by visit';
END $test$;
ROLLBACK;

DO $no_leak$
BEGIN
  IF EXISTS(
    SELECT 1 FROM public.pharmacy_dispatch_requests
    WHERE cloudflare_room_id IN ('cf-room-guest-isolation-ar-ci', 'cf-room-guest-isolation-br-ci')
  ) THEN RAISE EXCEPTION 'Test fixture persisted after rollback'; END IF;
END $no_leak$;

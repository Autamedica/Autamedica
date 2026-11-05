-- Self-validation escalation regression: run only in disposable local database.
BEGIN;
DO $test$
DECLARE
  v_user uuid := gen_random_uuid();
  v_doctor uuid := gen_random_uuid();
  v_message text := '';
BEGIN
  INSERT INTO auth.users(id,email)
  VALUES(v_user,'guard-approval-test-'||v_user||'@example.invalid');

  UPDATE public.profiles
  SET active=true,role='doctor',sss_validation_status='pending_review'
  WHERE user_id=v_user;

  INSERT INTO public.doctors(id,user_id,active,license_type,license_number,specialty)
  VALUES(v_doctor,v_user,true,'MN','CI-APPROVAL','Medicina General');
  INSERT INTO public.doctor_licenses(doctor_id,license_type,license_number,province,status)
  VALUES(v_doctor,'MN','CI-APPROVAL','CABA','active');

  IF app_private.is_doctor_dispatch_approved(v_doctor) THEN
    RAISE EXCEPTION 'Synthetic pending clinician was incorrectly approved';
  END IF;

  -- Change effective DB role and supply the own-user identity as PostgREST
  -- would. RLS allows profile updates, but the protected field trigger must
  -- stop a forged admin validation.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);

  BEGIN
    UPDATE public.profiles SET sss_validation_status='valid' WHERE user_id=v_user;
    RAISE EXCEPTION 'Self approval was wrongly permitted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
      IF v_message <> 'CLINICAL_VALIDATION_ADMIN_ONLY' THEN
        RAISE EXCEPTION 'Wrong profile rejection: %',v_message;
      END IF;
  END;

  EXECUTE 'RESET ROLE';

  IF app_private.is_doctor_dispatch_approved(v_doctor)
     OR EXISTS (
       SELECT 1 FROM public.profiles
       WHERE user_id=v_user AND sss_validation_status='valid'
     )
  THEN
    RAISE EXCEPTION 'Self validation changed clinical approval state';
  END IF;
END;
$test$;
ROLLBACK;

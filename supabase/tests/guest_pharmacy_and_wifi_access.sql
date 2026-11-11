-- Guest pharmacy request access is capability-scoped; lead capture is service-role only.
BEGIN;
DO $security_test$
DECLARE
  created jsonb;
  status jsonb;
  cancelled jsonb;
  request_id uuid;
  care_country text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);

  IF has_table_privilege('anon','public.pharmacy_consultation_requests','SELECT')
     OR has_table_privilege('anon','public.pharmacy_consultation_requests','INSERT') THEN
    RAISE EXCEPTION 'anon still has direct access to pharmacy request table';
  END IF;
  IF has_table_privilege('anon','public.wifi_leads','SELECT')
     OR has_table_privilege('anon','public.wifi_leads','INSERT') THEN
    RAISE EXCEPTION 'anon still has direct access to wifi_leads';
  END IF;
  IF NOT has_function_privilege('anon',
       'public.create_pharmacy_consultation_request(uuid,text,text,text,text,text,text)','EXECUTE')
     OR NOT has_function_privilege('anon',
       'public.get_pharmacy_consultation_request_status(uuid)','EXECUTE')
     OR NOT has_function_privilege('anon',
       'public.cancel_pharmacy_consultation_request(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'guest RPC grants are missing';
  END IF;

  created:=public.create_pharmacy_consultation_request(
    NULL,'Farmacia QA','TEST-CPF-0001','Paciente QA','+55 11 90000-0000','Test de privacidad'
  );
  request_id:=(created->>'id')::uuid;
  IF request_id IS NULL OR created->>'status'<>'pending' THEN
    RAISE EXCEPTION 'guest create RPC did not return the created request';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pharmacy_consultation_requests'
      AND column_name='care_country'
  ) THEN
    SELECT to_jsonb(r)->>'care_country' INTO care_country
    FROM public.pharmacy_consultation_requests r WHERE r.id=request_id;
    IF care_country IS DISTINCT FROM 'BR' THEN
      RAISE EXCEPTION 'country inference failed: %',care_country;
    END IF;
  END IF;

  status:=public.get_pharmacy_consultation_request_status(request_id);
  IF status->>'found'<>'true'
     OR status->>'patient_name'<>'Paciente QA'
     OR status ? 'patient_dni'
     OR status ? 'patient_phone' THEN
    RAISE EXCEPTION 'status RPC returned unexpected/private fields: %',status;
  END IF;

  cancelled:=public.cancel_pharmacy_consultation_request(request_id,'qa_test');
  IF cancelled->>'success'<>'true' THEN
    RAISE EXCEPTION 'guest cancel RPC failed: %',cancelled;
  END IF;

  status:=public.get_pharmacy_consultation_request_status(
    '00000000-0000-0000-0000-000000000099'::uuid
  );
  IF status->>'found'<>'false' THEN
    RAISE EXCEPTION 'unknown request was not reported as missing';
  END IF;
END
$security_test$;
ROLLBACK;

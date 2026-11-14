CREATE OR REPLACE FUNCTION public.match_dispatch_doctors(p_dispatch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,app_private,pg_temp
AS $function$
DECLARE v_enabled boolean;
BEGIN
  SELECT dispatch_engine_enabled INTO v_enabled
  FROM public.platform_operational_switches WHERE id='global';
  IF v_enabled IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('success',false,'code','DISPATCH_ENGINE_DISABLED');
  END IF;
  RETURN app_private.match_dispatch_doctors_without_switch(p_dispatch_id);
END;
$function$;
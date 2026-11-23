-- Defense in depth while the hosted PostGIS table remains owned by supabase_admin.
-- Client roles can read spatial metadata but cannot mutate it, even when inherited
-- extension ACL entries cannot be revoked by the migration runner.
CREATE OR REPLACE FUNCTION app_private.reject_spatial_ref_sys_client_dml()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'spatial_ref_sys_is_read_only'
      USING ERRCODE = '42501';
  END IF;

  IF TG_LEVEL = 'ROW' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION app_private.reject_spatial_ref_sys_client_dml()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.reject_spatial_ref_sys_client_dml()
  TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_spatial_ref_sys_reject_client_dml
  ON public.spatial_ref_sys;
CREATE TRIGGER trg_spatial_ref_sys_reject_client_dml
BEFORE INSERT OR UPDATE OR DELETE ON public.spatial_ref_sys
FOR EACH ROW
EXECUTE FUNCTION app_private.reject_spatial_ref_sys_client_dml();

DROP TRIGGER IF EXISTS trg_spatial_ref_sys_reject_client_truncate
  ON public.spatial_ref_sys;
CREATE TRIGGER trg_spatial_ref_sys_reject_client_truncate
BEFORE TRUNCATE ON public.spatial_ref_sys
FOR EACH STATEMENT
EXECUTE FUNCTION app_private.reject_spatial_ref_sys_client_dml();

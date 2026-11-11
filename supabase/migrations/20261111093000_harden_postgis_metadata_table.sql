-- Keep PostGIS reference metadata readable while enabling RLS.
ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spatial_ref_sys_public_read ON public.spatial_ref_sys;
CREATE POLICY spatial_ref_sys_public_read
  ON public.spatial_ref_sys
  FOR SELECT
  TO anon, authenticated, service_role
  USING (true);
GRANT SELECT ON TABLE public.spatial_ref_sys TO anon, authenticated, service_role;

-- These PostGIS metadata RPCs are not used by Autamedica and expose estimated
-- extents for arbitrary relation/column names. Keep them server-side only.
REVOKE ALL ON FUNCTION public.st_estimatedextent(text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.st_estimatedextent(text,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.st_estimatedextent(text,text,text,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.st_estimatedextent(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.st_estimatedextent(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.st_estimatedextent(text,text,text,boolean) TO service_role;

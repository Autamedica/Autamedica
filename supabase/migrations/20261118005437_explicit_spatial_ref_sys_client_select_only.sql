-- spatial_ref_sys is extension-owned by supabase_admin in hosted Supabase.
-- This ACL statement must run under the table owner/grantor to remove its explicit grants.
-- Client SELECT remains available for PostGIS metadata lookups.
REVOKE ALL PRIVILEGES ON TABLE public.spatial_ref_sys FROM anon, authenticated;
GRANT SELECT ON TABLE public.spatial_ref_sys TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.spatial_ref_sys FROM PUBLIC;

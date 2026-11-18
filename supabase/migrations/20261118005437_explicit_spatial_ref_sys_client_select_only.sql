REVOKE ALL PRIVILEGES ON TABLE public.spatial_ref_sys FROM anon, authenticated;
GRANT SELECT ON TABLE public.spatial_ref_sys TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.spatial_ref_sys FROM PUBLIC;

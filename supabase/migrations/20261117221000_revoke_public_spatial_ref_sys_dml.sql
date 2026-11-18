-- PostGIS grants DML to PUBLIC on some installations; revoke inheritance too.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.spatial_ref_sys
  FROM PUBLIC, anon, authenticated;

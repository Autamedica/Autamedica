-- Mirror of security migration applied in production on 2026-10-21.
-- Patient-demographics view previously bypassed patients RLS through its owner.
-- Authenticated doctor UI retains SELECT but receives only patient-scoped records.
-- Application-level doctor dashboard behavior needs an E2E verification.
ALTER VIEW public.v_patient_demographics SET (security_invoker = true);
REVOKE ALL ON TABLE public.v_patient_demographics FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.v_patient_demographics TO authenticated, service_role;

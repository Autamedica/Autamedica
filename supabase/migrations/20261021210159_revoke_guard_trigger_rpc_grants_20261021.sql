-- Mirror of emergency production migration applied 2026-10-21.
-- PUBLIC revocation alone is insufficient due to explicit Supabase default grants.
REVOKE EXECUTE ON FUNCTION public.guard_profile_role_authority() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_signup_privileged_metadata() FROM PUBLIC, anon, authenticated;

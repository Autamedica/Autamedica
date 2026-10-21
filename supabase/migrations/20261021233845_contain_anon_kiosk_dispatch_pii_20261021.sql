-- Mirror of an emergency migration already applied on 2026-10-21 in production.
-- Anonymous sessions must not read or rewrite clinical dispatch requests.
-- Preserve anonymous INSERT for the existing kiosk intake route, and preserve
-- authenticated/service_role grants. The full authenticated RLS scope is
-- deliberately NOT modified in this emergency containment.
REVOKE SELECT, UPDATE ON TABLE public.pharmacy_dispatch_requests FROM PUBLIC, anon;

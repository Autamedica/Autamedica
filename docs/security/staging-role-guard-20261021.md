# AutaMedica Staging — security validation (2026-10-21)

## Project and boundaries

- Supabase project: **AutaMedica Staging** (`qqevyncgnanpmvauehys`).
- Organization: the same organization as AutaMedica production.
- Region: `sa-east-1`, PostgreSQL 17.11.
- Dashboard: https://supabase.com/dashboard/project/qqevyncgnanpmvauehys
- Production reference (do **not** point test credentials here): `qxjjrpksmwwrmubhvjew`.
- Pricing at creation: Supabase quoted USD 0/month for creating the project; usage limits/charges are outside this quote.

**This is a security-specific staging fixture, not a full database clone or certified clinical release environment.** Production data was not transferred. The staging database has no Auth users or patient/profile records.

## Applied only to staging

1. `staging_minimal_role_security_fixture_20261021`: a minimal `public.user_role`, `public.profiles` fixture with RLS and self-service policy; this fixture is **not** a substitute for the real production schema.
2. `stage_verify_role_guard_authority_20261021`: the SQL from production hotfix `20261021210023_guard_role_authority_emergency_20261021.sql` (PR #536).
3. `stage_verify_role_guard_acl_20261021`: the SQL from production hotfix `20261021210159_revoke_guard_trigger_rpc_grants_20261021.sql` (PR #536).

The security smoke SQL `supabase/tests/role_authority_guard_smoke.sql` was executed via the connected Supabase project using `BEGIN`, temporary tables, controlled `authenticated` role and `ROLLBACK`. **Result: passed**.

Independent post-checks confirmed:
- `guard_profile_role_authority` trigger exists and is enabled on `public.profiles`;
- `guard_signup_privileged_metadata` trigger exists and is enabled on `auth.users`;
- `public.profiles` has RLS enabled;
- neither `anon` nor `authenticated` can directly execute the two guard functions;
- both Auth and profile row counts were zero.

## Still required for broad rollout

- Build a **complete schema staging environment** using reviewed, ordered repo migrations; the current fixture cannot validate appointments, calls, wallets, doctor registration, medical records, or clinical authorization end to end.
- Use synthetic, non-identifiable test accounts and data only.
- Set the repository Actions secret `SUPABASE_STAGING_DB_URL` to the **staging** database connection string, never production. This credential is not exposed by the connected GitHub/Supabase tools and has **not** been configured automatically.
- Do not trigger the PR #536 full staging tests against this minimal schema: its seven-function/view assertions require the complete schema.
- Validate Auth signup matrix (patient, doctor, pharmacist, organization/company admin), RLS patient isolation, server-side API authorization, payment webhooks and video-call end to end.
- Reconcile PR #534 with PR #536, independent review and deployment sequencing before merge.

## Manual connection setup

GitHub repo > Settings > Secrets and variables > Actions > New repository secret.

Name: `SUPABASE_STAGING_DB_URL`

Value: a properly TLS-configured PostgreSQL connection URL from the **AutaMedica Staging** project database settings. Do not paste this secret into an issue, pull request, commit, or chat.

There is no dependency on live clinical data, and no application endpoints are pointed at staging.

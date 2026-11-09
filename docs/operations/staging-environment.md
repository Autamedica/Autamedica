# AutaMedica staging environment

## Current target

- Supabase project: `qqevyncgnanpmvauehys` (dedicated staging; never production).
- Cloudflare Pages Preview branch: `staging-recovery`.
- Pages projects: `autamedica-web`, `autamedica-doctors`, `autamedica-patients`, `autamedica-companies`, `autamedica-admin`.
- GitHub recovery branch: `infra/staging-recovery-20261109`.

The legacy Git branches `staging` and `develop` are historical and must not be used as deployment sources. They are thousands of commits behind `main`. This workflow is deliberately based on current `main`.

## Required GitHub Environment configuration

Create/use the GitHub Environment named `staging` and configure these **environment secrets**. Never commit secret values or copy production credentials:

| Secret | Purpose |
| --- | --- |
| `STAGING_PUBLIC_SUPABASE_URL` | Must equal `https://qqevyncgnanpmvauehys.supabase.co` |
| `STAGING_PUBLIC_SUPABASE_ANON_KEY` | Public anon key belonging only to that staging project |
| `STAGING_PUBLIC_SIGNALING_URL` | Dedicated staging signaling endpoint |
| `STAGING_CLOUDFLARE_API_TOKEN` | Cloudflare token scoped to Pages deployments for the five projects |
| `STAGING_CLOUDFLARE_ACCOUNT_ID` | Cloudflare account identifier |
| `STAGING_CALLS_TURN_KEY_ID` | Dedicated staging Calls TURN key ID |
| `STAGING_CALLS_TURN_TOKEN` | Dedicated staging Calls TURN token |

Optional environment variable:

- `STAGING_GA4_MEASUREMENT_ID`: separate staging analytics stream. Leave unset to avoid contaminating production analytics.

Do not reuse production service-role keys, payment credentials, Memed credentials, or production TURN secrets. The workflow does not need a Supabase service-role key.

## Workflow behavior

`.github/workflows/deploy-staging.yml`:

1. Runs only from `infra/staging-recovery-20261109`.
2. Fails closed unless the Supabase URL is the dedicated staging project and all required secrets exist.
3. Runs typecheck, lint, hardcode checks, core package build and unit tests.
4. Builds `apps/web` with the dedicated staging Supabase, signaling, app and TURN configuration.
5. Deploys the built artifact to the five Cloudflare Pages projects under the Preview branch `staging-recovery`.
6. Verifies all five Preview URLs and the staging Supabase REST endpoint.

## Database safety

This workflow **does not run Supabase migrations, seeds, SQL fixtures, resets, or database pushes**. In particular, it must never call `supabase db push --include-all`.

Before enabling database migration CI, reconcile the staging migration ledger with the repository and classify the staging-only migrations. Use a disposable database for full migration replay. The production migration ledger contains unrecovered historical entries; do not copy production data or blindly replay the repository into staging.

Jordan SQL integration tests must use synthetic fixtures and rollback. Keep `ENABLE_JORDAN_PAYMENTS` disabled in production until the Jordan release gates pass.

## Preview URLs

- https://staging-recovery.autamedica-web.pages.dev
- https://staging-recovery.autamedica-doctors.pages.dev
- https://staging-recovery.autamedica-patients.pages.dev
- https://staging-recovery.autamedica-companies.pages.dev
- https://staging-recovery.autamedica-admin.pages.dev

A successful workflow run is required before treating these URLs as a verified staging deployment. Cloudflare Preview runtime bindings/secrets must also be configured in the Preview environment if any Pages Functions require them.

# AutaMedica Documentation Index

Navigation index for contributors. For runtime feature/flow activation state, `public.platform_operational_switches` is the sole operational authority (see [ADMIN_CONTROL_MANUAL.md](ADMIN_CONTROL_MANUAL.md)) rather than static Markdown snapshots.

---

## Active Root Guides

- [ARQUITECTURA_V2.md](ARQUITECTURA_V2.md) — Target Architecture v2 for governance, auditability, and production readiness.
- [API_REFERENCE.md](API_REFERENCE.md) — Auto-generated endpoint reference from `apps/web/src/pages/api/` and `supabase/functions/`, including auth patterns.
- [INFRASTRUCTURE.md](INFRASTRUCTURE.md) — Core infrastructure reference (Supabase production project, Cloudflare, portals, and services).
- [ADMIN_CONTROL_MANUAL.md](ADMIN_CONTROL_MANUAL.md) — Operational manual for `public.platform_operational_switches` as single authority over active/inactive flows.
- [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) — Multi-domain authentication and application environment variable configuration.
- [GLOSARIO_MAESTRO.md](GLOSARIO_MAESTRO.md) — Master contract glossary defining canonical shared types before implementation.

---

## Canonical Subdirectories

### `clinical/`
- [ar-certificate-electronic-readiness-20261103.md](clinical/ar-certificate-electronic-readiness-20261103.md) — Argentina electronic medical certificate readiness and controlled-pilot evidence (FirmAR/PFDR disabled).

### `compliance/`
- [brasil/atestados-memed-gap.md](compliance/brasil/atestados-memed-gap.md) — Brazil medical certificate issuance flow and Memed integration gap analysis.

### `database/`
- [README.md](database/README.md) — Overview of schema artifacts in `docs/database/` (contains historical notes; verify live status against `NIVEL4_ESTADO_VERIFICADO_2026-11-04.md`).
- [NIVEL4_ESTADO_VERIFICADO_2026-11-04.md](database/NIVEL4_ESTADO_VERIFICADO_2026-11-04.md) — Verified Level 4 recovery, Cloudflare R2 ciphertext custody, and open gate evidence (2026-11-04).
- [BACKUP_RUNBOOK.md](database/BACKUP_RUNBOOK.md) — Backup and isolated recovery drill runbook.
- [CONTROL_PLANE_CHECKLIST.md](database/CONTROL_PLANE_CHECKLIST.md) — Pre-change checklist for new tables, RLS policies, roles, and grants.
- [RUNTIME_ASSURANCE_CHECKLIST.md](database/RUNTIME_ASSURANCE_CHECKLIST.md) — Production change verification checklist for Supabase state and remote migrations.
- [RETAINED_STORAGE_API_REPLAY.md](database/RETAINED_STORAGE_API_REPLAY.md) — Isolated Storage API byte-replay drill procedure for retained recovery #38.
- [STORAGE_SERVICE_ISOLATED_CHECK.md](database/STORAGE_SERVICE_ISOLATED_CHECK.md) — Isolated functional check report for Storage service recovery.
- [SUPABASE_HARDENING_LESSONS.md](database/SUPABASE_HARDENING_LESSONS.md) — Lessons learned from Supabase production hardening (`2026-04-02`).
- [schema.sql](database/schema.sql), [schema-extensions.sql](database/schema-extensions.sql), [apply-transactional-extension.sql](database/apply-transactional-extension.sql) — Reference SQL schema and transactional extension snapshots.

### `integrations/`
- [farmalink-homologacion.md](integrations/farmalink-homologacion.md) — Farmalink `RecetaElectRest` v3.0.0 homologation status, TEST evidence, and operational restrictions.
- [farmalink-reconciled-20261105.md](integrations/farmalink-reconciled-20261105.md) — Farmalink reconciliation notes between PR #655 and PR #700 (`idOrganizacion=182`, ReNaPDiS legend).
- [farmalink-reconciliation-runbook.md](integrations/farmalink-reconciliation-runbook.md) — Safe Farmalink reconciliation and duplicate-prescription prevention runbook.
- [farmalink-recovery-implementation.md](integrations/farmalink-recovery-implementation.md) — Conservative Farmalink snapshot reservation and recovery implementation guide.
- [firmar-pfdr.md](integrations/firmar-pfdr.md) — FirmAR / PFDR (SIU-Araí) integration status and institutional approval prerequisites.
- [firmar-signature-requests.schema-draft.sql](integrations/firmar-signature-requests.schema-draft.sql) — Review-only SQL design draft for FirmAR enrollments and signature requests (not applied).
- [memed-demo-e2e-20261103.md](integrations/memed-demo-e2e-20261103.md) — Memed Brazil E2E DEMO contract test coverage with in-memory Supabase simulation.
- [memed-homologation-20261103.md](integrations/memed-homologation-20261103.md) — Memed Brazil homologation verification results (`integrations.api.memed.com.br/v1`).
- [memed-pilot-go-live-20261103.md](integrations/memed-pilot-go-live-20261103.md) — Read-only production inspection for the first controlled Memed Brazil pilot (`MEMED_RX_ENABLED=false`).
- [sisa-refeps-prescriber-validation.md](integrations/sisa-refeps-prescriber-validation.md) — SISA / REFEPS prescriber validation workflow and backend adapter references.
- [android-sfu-verification-plan.md](integrations/android-sfu-verification-plan.md) — Verification gates for Cloudflare Calls SFU media plane migration on Android.

### `operations/`
- [staging-environment.md](operations/staging-environment.md) — Dedicated staging environment target (Supabase `qqevyncgnanpmvauehys` and Cloudflare Pages preview projects).

### `security/`
- [PHARMACY_GUEST_TOKEN_CUTOVER_20261104.md](security/PHARMACY_GUEST_TOKEN_CUTOVER_20261104.md) — Shared guest video token signing secret fail-closed cutover and live runtime probe audit.
- [pharmacy-country-isolation-20261102.md](security/pharmacy-country-isolation-20261102.md) — AR/BR pharmacy release candidate criteria, jurisdiction isolation, and P0 checks.
- [emergency-table-privilege-containment-20261021.md](security/emergency-table-privilege-containment-20261021.md) — Containment of excessive `anon`/`authenticated` table privileges in production.
- [pharmacy-dispatch-rls-exposure-20261021.md](security/pharmacy-dispatch-rls-exposure-20261021.md) — Remediation of `public.pharmacy_dispatch_requests` RLS and PII exposure.
- [migration-history-reconciliation-20261021.md](security/migration-history-reconciliation-20261021.md) — Reconciliation between production `schema_migrations` ledger and repository SQL files.
- [production-hotfix-ledger-20261026.md](security/production-hotfix-ledger-20261026.md) — Ledger of SQL hotfixes applied directly to production on 2026-10-26.
- [production-audit-containment-20261027.md](security/production-audit-containment-20261027.md) — Production audit containment migrations applied on 2026-10-27.
- [secure-push-dispatch-release-20261026.md](security/secure-push-dispatch-release-20261026.md) — Prerequisites and secret bindings for secure on-call Push dispatch (BR).

### `releases/`
- [JORDAN_RELEASE_EVIDENCE.md](releases/JORDAN_RELEASE_EVIDENCE.md) — Technical and clinical release evidence and production gates.
- [auth-preview-url-2025-10-01.txt](releases/auth-preview-url-2025-10-01.txt) — Historical auth preview deployment URL (`2025-10-01`).

---

## Historical Snapshots vs. Current References

Documents in `docs/` with dated filenames matching `*2025*`, `*2026-02*`, `*2026-03*`, or `*2026-04*` (as well as files under `docs/archive/`) are **point-in-time historical audit, design, or migration snapshots** (for example, `AUDIT_REPORT_2025-10-04.md`, `PRODUCTION_READINESS_2026-02-19.md`, `DB_FRONTEND_CONFRONTATION_AUDIT_2026-03-19.md`, and `CHECKLIST_AUDITORIA_2026-04-17.md`).

Do **not** treat those dated snapshots as current production state, regulatory clearance, or runtime configuration. Always consult the **Active Root Guides** and the current operational/regulatory references under `clinical/`, `compliance/`, `database/`, `integrations/`, `operations/`, `security/`, and `releases/` (alongside live database/runtime state) when making engineering or compliance decisions.

# AutaMedica — Pharmacy dispatch privacy remediation (2026-10-21)

## Severity and initial finding

Production `public.pharmacy_dispatch_requests` contained patient CPF/DNI, phone, names, symptoms and call/session IDs. Anon and authenticated roles had SELECT/UPDATE rights; the old status-based policy exposed all `searching`, `matched` or `in_call` rows to unrelated roles. This is a **potential exposure**, not proof of prior access or exploitation.

## Production interventions, deployed and SQL-verified

- **20261021233845** `contain_anon_kiosk_dispatch_pii_20261021` — revoked anon SELECT/UPDATE, preserved anon INSERT and service_role CRUD.
- **20261021234110** `revoke_untrusted_public_table_truncate_trigger_references_20261021` — restricted TRUNCATE/TRIGGER/REFERENCES over ordinary public tables (separate PR #540).
- **20261021234645** `restrict_authenticated_kiosk_dispatch_pii_20261021` — replaced status-only SELECT/UPDATE policies with authenticated requester, assigned doctor, on-duty doctor for searching queue, or trusted system admin; limited authenticated UPDATE to status/lifecycle fields.

The migration SQL in this PR uses the **actual production ledger version 20261021234645**, not the earlier draft version 20261021232500.

## Tests performed

1. Exact policy migration passed a rollback-only transaction using synthetic doctor, duty and dispatch tables in Staging, with negative tests for anonymous read/update, patient isolation, doctor on-duty queue and protected clinical-column update.
2. The proposed policy also passed a rollback-only dry run against production: unrelated authenticated caller could read active requests before the change, but none after the change.
3. After actual production migration, verified `anon` SELECT=false, UPDATE=false, INSERT=true; `authenticated` sensitive-column UPDATE=false, status UPDATE=true; and `service_role` UPDATE=true.
4. A read-only `supabase/tests/kiosk_dispatch_acl_smoke.sql` regression test passed against live production grants/policies.
5. Production total dispatch record count remained at **153** during the verification; no row mutations were part of these migrations.

## Residual operational risk — MUST test

- Browser Express Consultation creates requests via a service-role server endpoint and polls through GET `/api/pharmacy/dispatch/[id]` with a signed guest token.
- Existing Android clients use direct PostgREST access, including anonymous `INSERT ... RETURNING`, SELECT and update; their unauthenticated flows may fail now that anon SELECT/UPDATE grants are revoked.
- The doctors-on-duty client queries dispatches directly: test with real synthetic doctor's Auth account and fresh heartbeat in a **complete schema staging**, not the minimal security fixture.
- Direct user UPDATE of lifecycle status by an owning patient is still allowed; validate allowed state transitions to prevent malicious status changes.
- Some server APIs use `service_role` and must themselves validate caller ownership and cryptographic guest tokens.
- The current staging project is a **minimal Auth/RLS test fixture**, not a full production clone; no end-to-end clinical claims.

## Remaining managed extension exceptions

`spatial_ref_sys` (PostGIS) and two `net` (pg_net) internal tables retain privileges from Supabase-managed `supabase_admin`. Treat as separate vendor-permissions follow-up; no unsupported change to extension-owned objects.

## Deployment guidance

The above database changes are **already active**; merging this PR only records their source. Do not run bulk migration replay against production until the six missing historical versions identified in PR #538 are reconciled. Validate Android and kiosk compatibility and do not revert the privacy guard merely to restore anonymous client access.

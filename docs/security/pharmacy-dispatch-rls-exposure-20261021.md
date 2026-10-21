# P0 — pharmacy_dispatch_requests RLS exposure

## Production finding (read-only inspection; 2026-10-21)

Production project `qxjjrpksmwwrmubhvjew` currently grants **SELECT and UPDATE to `anon`**, and permits `authenticated` sessions to SELECT or UPDATE rows based on broad status rules rather than ownership.

The `pharmacy_dispatch_requests_select_kiosk_or_confined` policy exposes all `searching`, `matched` or `in_call` rows to callers meeting no identity requirement. The underlying table contains `patient_cpf`, `patient_dni`, `patient_name`, `patient_phone` and `symptom_summary`, as well as call/session IDs. This is a **risk of unauthorized disclosure**, not evidence of past compromise.

The companion update policy grants callers broad rights to update `searching` rows even when no actor identity is bound. Supabase database advisor was not the source of this finding; it was detected by direct RLS policy and GRANT inspection.

## Proposed migration

`supabase/migrations/20261021232500_harden_pharmacy_dispatch_pii_rls.sql`

- Remove anonymous read/update privileges on the dispatch table, preserve anonymous INSERT for registered kiosk flows that use a server-controlled API.
- Scope authenticated SELECT to owning patient, assigned doctor, authorized system administrator, or current on-duty doctor for `searching` triage.
- Restrict authenticated UPDATE to owner, assigned doctor or administrator; restrict ordinary client UPDATE to `status`, `call_started_at`, `call_ended_at` only.
- Keep internal `service_role` access.
- Preserve signed guest-token access via the existing server route `/api/pharmacy/dispatch/[id]` after verifying proper token processing.

## Verification executed (NO production write)

The exact proposed migration was executed on the separate Staging project inside a transaction after creating synthetic `doctors`, `doctor_duty_status`, `pharmacy_dispatch_requests` and policy fixtures.

Assertions passed:
- `anon` SELECT denied.
- `anon` UPDATE denied.
- Signed-in doctor with fresh duty heartbeat sees searching triage and their assigned request, not unrelated in-call requests.
- Authenticated patient sees only their own request.
- Authenticated doctor cannot update a patient's `patient_phone` field.
- The complete test transaction was rolled back, leaving the staging security fixture intact.

**Important limitation:** this is a database-level, synthetic-schema test; it is **not** a production-equivalent end-to-end test.

## Release blockers / compatibility review

1. The browser helper `apps/web/src/lib/pharmacy/pharmacy-on-demand.service.ts` uses direct `.select('*')` on this table; it may fail for unauthenticated guests after hardening. Search indicates only unit tests currently reference this helper directly, but runtime/component mapping should be confirmed.
2. The Android `PharmacyDispatchRepositoryImpl.kt` creates, polls and updates dispatches directly using PostgREST; anonymous/guest handling needs a tested signed-API fallback before release.
3. The browser doctors-on-duty hook directly reads patient identity and symptoms; the proposed on-duty heartbeat authorization must be verified with a real doctor session in a full staging schema.
4. The secure server GET route requires a signed guest token. Verify its guest-token creation, validation, replay/expiry and response minimization before routing kiosks to it.
5. No patient data was read or copied as part of the audit. Aggregate statuses were inspected without identifiers.
6. Keep this PR **draft**, do not merge or deploy the migration before synthetic clinical E2E tests and a deployment/rollback plan.

Immediate operational option, if authorized after compatibility review: revoke `anon` SELECT and UPDATE first, monitor patient intake failures, then deploy scoped authenticated policies.

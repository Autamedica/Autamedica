# Jordan — release evidence, never a calendar gate

This is a **NO-GO** checklist until every row links to a successful run on
the exact reviewed/merged `main` SHA. Do not activate
`ENABLE_JORDAN_PAYMENTS`, accept live Mercado Pago payments, distribute
commercial QR codes or arrange commission transfers while any gate is open.

## Gate 1 — executed CI

CircleCI (no production publishing) can be manually triggered with
`run_jordan_gate=true`, with checkout source and config source both on
the same `main` commit. The workflow runs:
- `smoke` (Node privacy/config guards);
- `jordan_sql_contract` (offline source invariants, **not** SQL replay);
- `web` (locked dependencies, workspace package build, dispatch/payment/media
  Vitest, Astro typecheck and build);
- `jordan_deno` (synthetic SFU Edge Function tests);
- `android` (Kotlin compile, JVM tests, test-source compile, unsigned bundle).

The `web` and `jordan_deno` jobs depend on both inexpensive first checks;
`android` runs only once web and Deno passed. This is an explicit
Free-credit opt-in; ordinary pushes are **not** configured to create thousands
of builds. If GitHub Actions reports `startup_failure`, this does not pass
the gate. **Store pipeline URL, exact SHA, job list, pass/fail and logs.**
A green static contract check is not a green DB replay.

## Gate 2 — disposable DB before existing staging

Reconcile source migration history, baseline schema and staging schema drift
**before writing to current staging**. The current staging was read-only
verified missing `dispatch_offers`, `match_dispatch_doctors`, request
`patient_id`, `price_brl`, `doctor_fee_brl`, and guest dispatch sessions.
Do not backfill just the missing columns: clinical ACLs, patient allocation,
doctor credentials, RPC signatures, triggers and migrations must match.
Run the full reviewed migrations in a NEW disposable local DB, then SQL
rollback tests `jordan_br_79_40_dispatch_isolated.sql`,
`jordan_first_contact_commission_isolated.sql` and
`pharmacy_referral_commission_isolated.sql`.
Only afterward seek approval to reconcile existing staging; production is last.

## Gate 3 — Brazil-only

Verify #716 trigger and current web intake: AR / unknown + JORDAN rejected,
BR general accepted, non-Jordan Argentina still functions. Both read-only
presence checks and executed tests are required.

## Gate 4 — Android

Rebase #707 on main without reverting #725/#726/#716. Validate signed QR,
BR locale, token-scoped queue recovery, accepted R$40 offer, R$79 checkout,
PSP-approved vs pending/refunded, process death and real Android device.
No assertion that JVM tests alone are instrumented device coverage.

## Gate 5 — verified identity

Phone, CPF typed by a guest and generated guest `patient_id` are NOT verified
identity. Deduplicated contact-ledger accounting is provisional, not a
first-person-conversion guarantee or a payout instruction. Add an approved
trusted verification provenance before any partner disbursement.

## Gates 6–7 — PSP TEST, video

Run only with Mercado Pago TEST and synthetic clinician/patient records.
Trace request, accepted medical offer R$40, patient checkout R$79,
provider reconciliation, pending/rejected/refunded reversal, web/Android
join, participants vs outsiders, and SFU session/room binding.
A return to the browser is not payment proof.

## Gates 8–9 — production decision

Record review, sign-off, SHA, migration replay logs, both roles' video
smokes and refunds. Verify at least one eligible on-duty BR doctor, deployed
web commit equals reviewed commit and the feature flag is **false** before
go/no-go. Only after explicit GO, enable the scoped flag with monitoring and
immediate rollback ability.

| Gate | State | Evidence link / run | Owner approval |
|---|---|---|---|
| 1 CI | NO-GO | Missing green executed run | Pending |
| 2 Migrations | NO-GO | Disposable replay not executed | Pending |
| 3 Brasil-only | NO-GO | #716 merged; no executed smoke | Pending |
| 4 Android | NO-GO | #707 draft/unverified | Pending |
| 5 Identity | NO-GO | No verified subject available | Pending |
| 6 PSP TEST | NO-GO | No full TEST run | Pending |
| 7 Video | NO-GO | SFU session mapping unverified | Pending |
| 8 Decision | NO-GO | No sign-off | Pending |
| 9 Live enable | OFF | `ENABLE_JORDAN_PAYMENTS` unset/false | Pending |

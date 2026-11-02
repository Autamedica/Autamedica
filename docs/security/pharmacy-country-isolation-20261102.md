# AutaMedica pharmacy isolation P0 — 2026-11-02

Status: **candidate PR only**, not deployed. Production Rx/medical history must remain untouched.

## Isolation contract
- New pharmacies require an explicit `AR` or `BR` jurisdiction. No locale, browser, phone or address inference.
- A pharmacist inherits a country from the assigned pharmacy; their country cannot be supplied independently.
- A dispensing order derives its country from the prescription, and is rejected if the active physician, patient or assigned pharmacy do not have exactly that country.
- Legacy `AR` prescriptions by `BR` physicians, or prescriptions for patients with unknown country, cannot create a new dispensing order.
- Every validation and dispensing event requires a **licensed pharmacist** attached to the assigned active pharmacy in the same country. An unassigned order can be seen and claimed only by pharmacists in that country; it cannot be validated or dispensed without assignment.
- New orders default to `prescriber_verified=false`, `reconciliation_status=pending`, `clinician_decision=under_review`. An order cannot be marked approved/dispensed until a separate clinical workflow attests those fields. **These flags are not automatically set to true by a login.**
- The initiating HTTP function permits only the authenticated issuing physician, with a matching active license and patient jurisdiction.

## Pre-deployment gates
1. Restore a **disposable test database** with the production schema, or finish migrating the staging environment. On 2026-11-02, AutaMedica staging `qqevyncgnanpmvauehys` lacked `prescriptions`, `pharmacies`, `pharmacists` and `dispensation_orders`, preventing a valid integration test there.
2. Run migration `20261102093000_pharmacy_country_isolation_p0.sql` in disposable test, then `supabase/tests/pharmacy_country_isolation.sql` with `autamedica.isolated_test=on`.
3. Exercise both AR and BR endpoints with an authenticated physician, licensed pharmacist and registered pharmacy. Assert cross-country `SELECT`, claim, validation and dispense are denied (HTTP 403 or DB constraint).
4. Verify a non-pharmacist authenticated user cannot create an order for another physician's prescription, and a technician cannot validate/dispense.
5. Verify an unknown-country patient, mislabelled historical prescription or unassigned order is rejected; a properly assigned and clinically verified matching-country order can progress to dispensing.
6. Confirm all live callers of `create-dispensation-order` and the direct prescription-issuance functions are compatible with the new verification defaults. Test for partial writes when an order is rejected.
7. Run CI plus Supabase security advisors. Deploy DB migration **before** code that reads `care_country`, then the Edge functions and web application under controlled release. Monitor errors and pharmacy queues.
8. Do not update or relabel historic prescription records automatically. Reconcile the 72 inconsistent AR/BR records, especially 23 PDFs, independently with original audit evidence.

## Not covered by this P0
- The guest QR onboarding/dispatch route does not yet propagate a trustworthy country.
- The old `pharmacy_consultation_requests` workflow and the historical `pharmacy_dispatch_requests` rows remain subject to separate P1 cleanup.
- Operational pharmacist-license authenticity requires a regulator-backed validation workflow; here the role and non-empty credential are required, not independently verified.
- Setting the review flags to `true` must be implemented as a documented, authorized clinical reconciliation step, not via an unauthenticated self-service shortcut.

No clinical documents, historical prescriptions, or live production settings are modified by this PR alone.

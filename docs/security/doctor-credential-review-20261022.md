# Doctor credential activation: release checklist (2026-10-22)

## Why this exists

The production database contains 26 active `doctors` rows with `license_number` beginning `PENDING`. Aggregate-only SQL found one appointment associated with these records, no linked medical_records, and four marked `is_on_duty=true` (none with a heartbeat newer than 90 seconds at the moment of inspection). These aggregates **do not establish credential legitimacy** and do not prove any misuse.

## Protection in PR #545

- Every newly provisioned doctor (from Auth signup or role-specific profile trigger) gets `active=false`.
- PENDING-style credentials cannot enable a new clinical doctor record.
- `anon` and `authenticated` cannot directly modify trusted activation/license fields.
- Self-service profile API is not allowed to set `active`; it preserves existing approved doctors' activation and confirmed license, and records an applicant's claimed credential while keeping them inactive.
- The admin-backed pharmacy duty service requires `doctors.active=true`, while the clinical queue also requires fresh authorized duty presence (90 seconds).

This PR **does not perform any production UPDATE** and does not retroactively disable an existing doctor.

## Required human verification before any activation

1. Confirm the applicant's identity and authorization to practice in the relevant country, state/province and specialty using the respective official professional registry.
2. Validate registration number, jurisdiction, name match, current status, specialty/RQE (where applicable), sanctions/suspensions if officially available, and supporting documentation. A format-valid license string is not evidence of validity.
3. Record the review, reviewer, time, exact official source reference and outcome in an auditable internal workflow. Do not rely on `user_metadata.role` or a self-uploaded image alone.
4. Only a trusted admin/service process may set the confirmed license and activate a doctor; `active=true` must not originate from a client body.
5. Test patient scheduling, prescriptions, e-prescriptions, medical-record access, pharmacy queue and video-call permission boundaries for pending vs verified doctor using synthetic users in a **complete** staging schema.

## Existing active PENDING records

Do not bulk disable, edit licenses, contact patients, or modify appointments until a responsible human has reviewed each record's credential status and clinical dependencies. Analyze the one associated appointment's care obligations using appropriately authorized personnel; no patient identity was read during this audit.

## Remaining release blockers

- Full Staging Auth+web+Android E2E with synthetic users; local database replay alone is insufficient.
- PR #534 authorization refactor must eliminate remaining mutable JWT metadata role checks.
- Review all service-role clinical endpoints and doctor_licenses approval workflows: role='doctor' in profiles must not alone authorize actions.
- Add durable approval audit fields and a real trusted activation endpoint/workflow before treating the medical credential process as complete.

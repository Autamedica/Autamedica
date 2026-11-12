# Jordan — release evidence and production gates

This is a **NO-GO** checklist until each gate has executed successfully on the exact reviewed/merged `main` SHA. Keep `ENABLE_JORDAN_PAYMENTS` disabled. Do not accept live Mercado Pago payments, distribute commercial QR codes, or transfer commissions while any gate remains open.

## Integrated changes

- **#707 — Android QR and request recovery:** merged into `main`. This integrates the Jordan QR route and the persistent request recovery path; it does not replace device-level validation.
- **#729 — SFU room/session binding:** merged into `main`; migration `20261112025805_sfu_room_session_bindings_20261112` is present in production migration history. Production flag and shared HMAC parity still require the coordinated rotation workflow.
- **#726 — Brazil pricing:** merged; production enforces patient R$79 and doctor offer R$40 through the Jordan quote trigger.
- **2026-11-12 — first-contact phone guard:** migration `20261108092000_jordan_first_contact_commission_guard` applied to production. It deduplicates by normalized BR phone and reverses refunded commissions. A guest phone is **not verified identity** and this provisional ledger is not authorization to pay a partner.
- **#757 — SFU HMAC rotation workflow:** conflict resolved against `main`; updated branch commit `411bdf87568a50b3b2f43c0f28456ca771c4e239`. CI/merge and the coordinated production rotation remain pending.
- **#744 — BR generalist/specialist opt-in dispatch:** marked Ready for review; CI and disposable SQL replay pending.
- **#728 — verified first-person commission gate:** marked Ready for review; CI and disposable SQL replay pending. No trusted identity-provider integration is currently available; fail-closed behavior must remain.

## Gate 1 — CI and Android recovery

Run CircleCI with `run_jordan_gate=true` on one exact `main` SHA. The gate must include source smoke, SQL contracts, web tests/build, Deno tests, and Android JVM tests/build. A GitHub `startup_failure` with zero jobs is not a passing test.

Android recovery must be tested for process death while a Jordan request is `in_call`: pending payment keeps the patient on checkout and polls the PSP; approved payment alone enables navigation; rejected/refunded payment never enables the call. The new JVM regression tests are in the Android recovery PR; a JVM pass is not a substitute for physical-device QA.

## Gate 2 — database replay and commission identity

Run the full reviewed migration chain and isolated SQL fixtures in a new disposable local database. Do not run synthetic fixtures against production. Production now has the normalized-phone first-contact guard, but #728's verified-subject migration must be replayed and validated before verified commission accounting is considered complete. The trusted verifier must be a real backend-trusted GovBR/CPF KYC integration; typed CPF, phone, and guest patient IDs are not identity proof.

## Gate 3 — BR-only and dispatch capacity

The production BR-only referral trigger and R$79/R$40 quote trigger are installed. Validate the new #744 matcher with its disposable SQL fixture, including explicit general-tier opt-in, license approval, BR country, guard duty, heartbeat, and no cross-country assignment. Production capacity last returned **0 doctors on duty**; the feature cannot be operationally exercised until at least one eligible BR doctor has a fresh heartbeat.

## Gate 4 — SFU/HMAC

After #757 is merged, run the coordinated rotation workflow with its explicit `ROTATE` confirmation. It must update the same HMAC key in Cloudflare Pages Web, Cloudflare Pages Doctors, and Supabase Edge; set `SFU_SESSION_BINDINGS_ENABLED=true`; read back secret metadata; and pass the live signed-token probe. Never rotate only one destination.

## Gate 5 — PSP TEST and video

Use Mercado Pago TEST and synthetic patient/doctor records only. Trace request, accepted R$40 medical offer, R$79 patient checkout, provider reconciliation, pending/rejected/refunded states, Android process restoration, and SFU room/session binding. A browser redirect is not payment proof.

## Gate 6 — production decision

Before any GO decision, require successful CI on the reviewed SHA, disposable migration replay, identity-proof tests, PSP TEST, end-to-end video tests, at least one eligible BR doctor on duty, verified secret parity, and a deployed web commit matching the reviewed code. Keep `ENABLE_JORDAN_PAYMENTS` unset/false until explicit release sign-off.

| Gate | Current state | Evidence / outstanding work |
|---|---|---|
| #707 Android QR/recovery base | Integrated | Merged; device QA still pending |
| #729 SFU binding base | Integrated | Merged; production flag/HMAC parity pending |
| #726 tariff R$79/R$40 | Integrated | Production trigger installed |
| First-contact phone guard | Applied | Migration `20261108092000` applied; not verified identity |
| Android recovery regression | In progress | New JVM tests and PR pending CI |
| #757 HMAC rotation | In progress | Rebased commit `411bdf8`; CI/merge/rotation pending |
| #744 dispatch eligibility | Ready for review | CI and disposable SQL replay pending; 0 BR doctors on duty |
| #728 verified identity | Ready for review | CI/replay pending; trusted identity provider unavailable |
| PSP TEST + SFU E2E | NO-GO | Not executed end to end |
| `ENABLE_JORDAN_PAYMENTS` | **OFF** | Must remain unset/false |
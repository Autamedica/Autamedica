# Jordan — release evidence and production gates

## Autoridad única de interruptores operativos

La única autoridad sobre el estado activo/inactivo de cualquier flujo es la fila global de `public.platform_operational_switches`, gobernada desde `/admin`. Ningún estado estático de este documento ni de otro Markdown representa configuración operativa vigente. Queda prohibido bloquear PRs, merges, CI o despliegues basándose en estados estáticos de documentos Markdown. Los checklists de este archivo documentan evidencia y procedimientos, no interruptores ejecutables.

This is a **NO-GO** checklist until each gate has executed successfully on the exact reviewed/merged `main` SHA. Keep `ENABLE_JORDAN_PAYMENTS` disabled. Do not accept live Mercado Pago payments, distribute commercial QR codes, or transfer commissions while any gate remains open.

## Integrated changes

- **#707 — Android QR and request recovery:** merged into `main`; device-level QA remains pending.
- **#729 — SFU room/session binding:** merged into `main`; migration `20261112025805_sfu_room_session_bindings_20261112` is present in production.
- **#726 — Brazil pricing:** merged; production enforces patient R$79 and doctor offer R$40 through the Jordan quote trigger.
- **First-contact phone guard:** production function `sync_pharmacy_referral_commission()` now normalizes Brazilian phone numbers, serializes concurrent payment hooks, allows one provisional R$10 commission per referral/contact, and reverses refunded payments. Applied through Supabase as migration version `20261112092725` (`jordan_first_contact_commission_guard`). Guest phone is **not verified identity** and this provisional ledger is not authorization to pay a partner.
- **#759 — Android payment recovery:** merged as `1731faf8eab8cfd32c0999b8b05fef431927e5bd`. Restored Jordan `in_call` requests now require PSP approval before navigation and independently poll payment state. Three JVM regression tests cover pending, approved, and refunded restoration. Android CI run `43192322223` is still pending final result at the time of this update.
- **#757 — SFU HMAC rotation workflow:** rebased against `main`; branch commit `411bdf87568a50b3b2f43c0f28456ca771c4e239`. Audit check is red; PR remains open. Independently, rotation workflow run `43192563000` completed successfully: shared HMAC was rotated and verified across Cloudflare Web, Cloudflare Doctors, and Supabase Edge; `SFU_SESSION_BINDINGS_ENABLED=true` was applied; the live signed-token probe passed.
- **#744 — BR generalist/specialist opt-in dispatch:** Ready for review. Disposable migration replay and Tests pass; Audit is red. Production still reports 0 BR doctors on duty.
- **#728 — verified first-person commission gate:** Ready for review. Disposable migration replay and Tests pass; Audit is red. No trusted identity-provider integration is available; the design must remain fail-closed and no Jordan commission may be paid without trusted proof.

## Gate 1 — CI and Android recovery

Require successful source smoke, SQL contracts, web tests/build, Deno tests, and Android JVM tests/build on one exact reviewed SHA. A GitHub `startup_failure` with zero jobs is not a passing test. The Android regression covers process death while a Jordan request is `in_call`: pending payment keeps the patient on checkout and polls the PSP; approved payment alone enables navigation; refunded payment never enables the call. JVM coverage does not replace physical-device QA.

## Gate 2 — database replay and commission identity

Run the full reviewed migration chain and isolated SQL fixtures in a new disposable local database. Do not run synthetic fixtures against production. The normalized-phone first-contact guard is deployed, but #728's verified-subject migration and its tests must be accepted before verified commission accounting is considered complete. A real backend-trusted GovBR/CPF KYC integration is still required; typed CPF, phone, and guest patient IDs are not identity proof.

## Gate 3 — BR-only and dispatch capacity

The production BR-only referral trigger and R$79/R$40 quote trigger are installed. Validate #744's matcher with its disposable SQL fixture, including explicit general-tier opt-in, license approval, BR country, guard duty, heartbeat, and no cross-country assignment. Production capacity last returned **0 doctors on duty**; operational dispatch still requires an eligible BR doctor with a fresh heartbeat.

## Gate 4 — SFU/HMAC

Rotation workflow `43192563000` succeeded. The same HMAC was applied to Cloudflare Pages Web, Cloudflare Pages Doctors, and Supabase Edge; `SFU_SESSION_BINDINGS_ENABLED=true` is present; secret metadata was read back; and the live signed-token probe passed. Do not rotate only one destination.

## Gate 5 — PSP TEST and video

Use Mercado Pago TEST and synthetic patient/doctor records only. Trace request, accepted R$40 medical offer, R$79 patient checkout, provider reconciliation, pending/rejected/refunded states, Android process restoration, and SFU room/session binding. A browser redirect is not payment proof.

## Gate 6 — production decision

Before any GO decision, require green required CI, disposable migration replay, identity-proof tests, PSP TEST, end-to-end video tests, at least one eligible BR doctor on duty, verified secret parity, and a deployed web commit matching the reviewed code. Keep `ENABLE_JORDAN_PAYMENTS` unset/false until explicit release sign-off.

| Gate | Current state | Evidence / outstanding work |
|---|---|---|
| #707 Android QR/recovery base | Integrated | Merged; device QA pending |
| #729 SFU binding base | Integrated | Merged; binding migration present |
| #726 tariff R$79/R$40 | Integrated | Production quote trigger installed |
| First-contact phone guard | Applied | Production migration `20261112092725`; phone is not verified identity |
| #759 Android payment recovery | Merged | `1731faf8`; Android CI run `43192322223` pending final result |
| #757 HMAC rotation | Applied / PR open | Workflow `43192563000` success; Audit red on PR |
| #744 dispatch eligibility | Ready for review | Tests + disposable replay pass; Audit red; 0 BR doctors on duty |
| #728 verified identity | Ready for review | Tests + disposable replay pass; Audit red; trusted verifier unavailable |
| PSP TEST + SFU E2E | NO-GO | Not executed end to end |
| `ENABLE_JORDAN_PAYMENTS` | **OFF** | Must remain unset/false |
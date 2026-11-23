# Prescription provider E2E — real clinical records only

This runbook verifies the four authenticated patient-delivery paths. The verifier performs read-only database queries and downloads; the first successful authenticated Memed PDF download may pin the actual downloaded SHA-256 and byte length on that provider row. It does not create prescriptions, change provider state, insert clinical fixtures, call DEMO endpoints, or count a login redirect as a pass.

## Production preconditions observed on 2026-11-19

| Path | Observed production state | Readiness |
| --- | --- | --- |
| Argentina / Farmalink | Issuance is governed by Cloudflare Pages runtime flags `FARMALINK_ENABLED` and `FARMALINK_REQUIRE_EXTERNAL_AC`; `FARMALINK_BASE_URL` plus OAuth/basic credentials are provider configuration. The application still requires REFEPS and SSS `valid`/`exempt`, a non-self-signed unexpired certificate and a successful PAdES signature. The external-AC-only requirement is policy-controlled, not hardcoded. | **Not enabled in production until the founder turns on the runtime flag and supplies the live provider configuration.** `FARMALINK_REQUIRE_EXTERNAL_AC=false` permits a valid non-self-signed signing certificate without an external-AC classification; it does not bypass REFEPS/SSS, certificate validity, cryptographic signing or Farmalink acceptance. |
| Brazil / Memed doctor | One linked and verified Memed identity. The active BR pilot doctor has Memed birth date and matching CFM-validated CRM/UF. Web config has `MEMED_RX_ENABLED=true` and Memed secret bindings present. | **Doctor master data ready.** This is not evidence of a real prescription emission. |
| Brazil / Memed patient | Memed requires a valid CPF, an active patient account, `care_country=BR`, recorded LGPD consent/date and a real doctor-patient encounter. DOB and gender are optional Memed patient attributes; supplied values are validated but their absence no longer blocks. Current production sample: 7 distinct appointment-linked patient records, 2 BR; the only BR record with dated LGPD consent has no valid 11-digit CPF. | **Patient data blocker: `patients.cpf` is missing/invalid.** A current valid encounter is also required at issuance time. |
| Brazil / Memed prescription | `memed_prescriptions` contains **0** rows, **0** provider-signature verified rows and **0** delivery confirmations. | **Blocked.** No provider-issued prescription exists to retrieve. |
| Android / Memed mobile | `memed-mobile-preflight` is deployed with JWT verification. `MEMED_MOBILE_ENABLED` and mobile pilot settings exist as secret bindings, but their values are not readable through current configuration metadata. | **Runtime preflight still required.** A secret binding's presence does not prove that it is enabled or points to the same pilot doctor. |

For Argentina, complete formal Farmalink homologation and obtain production approval before setting the production endpoint and enabling emission. The physician also needs valid REFEPS/SSS jurisdiction status, an eligible unexpired external AC PAdES certificate, and a patient meeting Farmalink's CUIL/affiliate and jurisdiction requirements. Do not replay a previous ambiguous `altaReceta` timeout; reconcile it with Farmalink first.

For Brazil, use the normal patient registration, identity and LGPD consent flow, then establish the real appointment/clinical scope with the pilot doctor. Do not manufacture a patient or consent record for QA.

## Secure environment

Put these values in a private local `.env` or CI secret store. Never commit the file or print tokens.

Shared:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (read-only REST queries by the verifier; never sent to the client)
- `AUTAMEDICA_WEB_API_URL`
- `E2E_CROSS_USER_TOKEN` (valid session token for a different active patient)

Argentina:
- `E2E_AR_DOCTOR_ID`
- `E2E_AR_PATIENT_ID`
- `E2E_AR_PRESCRIPTION_ID`
- `E2E_AR_EXTERNAL_ID`
- `E2E_AR_PATIENT_TOKEN` (Web case only)

Brazil:
- `E2E_BR_DOCTOR_ID`
- `E2E_BR_PATIENT_ID`
- `E2E_BR_MEMED_ROW_ID` (UUID primary key from `memed_prescriptions`)
- `E2E_BR_EXTERNAL_ID`
- `E2E_BR_PATIENT_TOKEN` (Web case only)

For Android, first sign in to the real patient account in the installed application, open the prescription and complete the in-app download. The app stores the verified PDF in its private `cache/prescriptions` directory. Copy that exact downloaded file through an authorized QA/device workflow and set:
- `E2E_AR_ANDROID_PDF_PATH`
- `E2E_BR_ANDROID_PDF_PATH`

The Android case does not accept a manually downloaded provider link: it hashes the file saved by the app's authenticated downloader.

## Execute the four paths

Run each case separately from the repository root:

```bash
node scripts/qa/prescription-provider-e2e.mjs --case ar-web
node scripts/qa/prescription-provider-e2e.mjs --case ar-android
node scripts/qa/prescription-provider-e2e.mjs --case br-web
node scripts/qa/prescription-provider-e2e.mjs --case br-android
```

The verifier exits non-zero if the provider row, owner IDs, country, external provider ID, signature evidence, persisted digest, PDF bytes, or cross-user denial is missing or inconsistent. A redirect to login, HTML response, DEMO receipt, synthetic provider receipt, or manually inserted row is not a pass.

## Evidence per case

Each JSON report records `doctor_id`, `patient_id`, `care_country`, `external_id`, provider status, signature evidence, database persistence, patient download/access, cross-user HTTP status (must be **401 or 403**), SHA-256 of the actual downloaded bytes and byte length. It never prints credentials, CPF, date of birth, patient names, provider signed URLs or raw provider payloads.

- **AR Web**: authenticated request to the private PAdES API; checks response SHA header and downloaded bytes against `prescriptions.pdf_sha256`, `pdf_byte_length` and both signature/issuance audit events.
- **AR Android**: hashes the PDF actually saved by the Android app and compares it with the same persisted prescription digest; probes cross-user denial independently.
- **BR Web**: authenticated request to the patient-scoped Memed proxy; requires provider signature verification, pins the first real download digest, then verifies the persisted digest against the downloaded bytes.
- **BR Android**: hashes the file saved by the app's authenticated downloader and compares it with the same persisted Memed digest; probes cross-user denial independently.

Only a case whose verifier exits 0 is passed. The four cases remain **not run / blocked** until the provider emits real prescriptions and the required patient/doctor preconditions exist.


## Runtime governance switches

Configure these as Cloudflare Pages production variables for the relevant projects (`autamedica-doctors` for doctor issuance; keep `autamedica-web` aligned where the same APIs are deployed):

- `FARMALINK_ENABLED=true`: founder-controlled Argentina provider switch.
- `FARMALINK_BASE_URL=https://<live-provider-host>`: live Farmalink endpoint; do not use the TEST host for production issuance.
- `FARMALINK_REQUIRE_EXTERNAL_AC=true|false`: defaults to `true`; set `false` only by explicit governance decision. A real, non-self-signed, unexpired certificate and successful PAdES signing remain mandatory.
- `MEMED_RX_ENABLED=true`: enables the Memed Web/provider flow.
- `MEMED_MOBILE_ENABLED=true`: enables Android handoff; requires `MEMED_RX_ENABLED=true` as well.

Memed additionally requires `MEMED_API_KEY`, `MEMED_SECRET_KEY`, `MEMED_API_URL=https://api.memed.com.br/v1`, `MEMED_SCRIPT_URL=https://partners.memed.com.br/integration.js`, and the configured pilot doctor ID. The admin health endpoint reports boolean flag state and configuration presence only; it never returns secret values.

For the first BR patient, the exact required identity field absent in the current consented patient record is `patients.cpf` (valid 11-digit CPF checksum). DOB and gender are optional. The patient's active account, dated LGPD consent and an active/recent doctor-patient encounter remain independently required.

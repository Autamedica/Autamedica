# Prescription provider E2E — real clinical records only

This runbook verifies the four authenticated patient-delivery paths. The verifier performs read-only database queries and downloads; the first successful authenticated Memed PDF download may pin the actual downloaded SHA-256 and byte length on that provider row. It does not create prescriptions, change provider state, insert clinical fixtures, call DEMO endpoints, or count a login redirect as a pass.

## Production preconditions observed on 2026-11-19

| Path | Observed production state | Readiness |
| --- | --- | --- |
| Argentina / Farmalink | Production Pages projects `autamedica-web` and `autamedica-doctors` do not have `FARMALINK_ENABLED` or `FARMALINK_BASE_URL`; the client defaults emission to disabled. There are 24 active AR doctors, 13 with REFEPS and SSS `valid`/`exempt`, but **0** satisfy the full issuance gate with an eligible unexpired external AC PAdES certificate. No `vendor_name=farmalink` prescription rows exist. | **Blocked.** Formal production homologation/approval, live endpoint and runtime config, an eligible AC external certificate for the issuing doctor, and a real successful provider registration are required. |
| Brazil / Memed doctor | One linked and verified Memed identity. The active BR pilot doctor has Memed birth date and matching CFM-validated CRM/UF. Web config has `MEMED_RX_ENABLED=true` and Memed secret bindings present. | **Doctor master data ready.** This is not evidence of a real prescription emission. |
| Brazil / Memed patient | The pilot has 35 appointments; **0** patients meet all eligibility predicates together: active account, `care_country=BR`, LGPD consent and date, CPF, birth date and gender. | **Blocked.** A real patient must complete normal identity, consent and clinical-relationship flows. |
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

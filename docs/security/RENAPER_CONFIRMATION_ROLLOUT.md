# RENAPER Argentina — self-attestation and immutable official identity

**Status:** draft / NOT applied to Supabase or Cloudflare. This is an explicit patient acknowledgement of matched official data, **not biometric verification or official identity-proofing**.

## Preconditions
1. Obtain and document permission to process RENAPER personal data/photo presence under the actual government integration agreement; validate purpose, retention, consent, privacy notice and patients' access/rectification rights.
2. Deploy and test server security PR #740 (fail closed when `patients.care_country != AR` or authenticated patient's saved DNI/sex differs). Confirm the Cloudflare Patients → protected Supabase Edge Function fallback and non-persistence of official PII.
3. Generate a real numbered migration with `supabase migration new renaper_confirmed_identity_lock` and insert the reviewed SQL from `renaper-confirmed-identity-lock.proposed.sql`. Do not apply directly from this documentation file.
4. Use staging with **synthetic** patients, one `care_country='AR'`, one `BR`, one `NULL`, separate authenticated users and isolated service-role test client.

## Contract
- Only an AR patient with saved DNI + sex and an approved payment can see full identifying values and explicitly acknowledge them.
- Server ignores client names/DNI/photo; obtains fresh official RENAPER record, confirms exact DNI/sex match; single privileged DB RPC atomically writes official canonical name, DNI, CUIL, birthdate, sex, address and confirmation timestamp.
- `renaper_confirmation_method='patient_attested_official_data'` intentionally does **not** assert SID biometric verification.
- The UI displays only a locked, illustrative photo silhouette; provider photo bytes must not be delivered to Android, logged, or stored. Its hash is only kept when permitted by the agreement.
- After attestation: patient DNI, names, CUIL, birthdate, sex, country, confirmation timestamp and photo hash cannot be changed via client, REST, admin or a normal service-role UPDATE. Address remains editable.
- A clinical/administrative correction or legally required erasure needs a separate audited privileged procedure; no backdoor mutation from the mobile app.
- Existing historical `patients.insurance_info.official_data` may contain source PII; clean separately with a documented backup and approval.

## Minimum staging regression matrix
| Scenario | Expected |
|---|---|
| AR lookup + verified JWT + matching registered DNI/sex | Official query available |
| BR patient or `care_country IS NULL` | No Android or web RENAPER UI; HTTP 403/409 |
| Caller substitutes another DNI | Rejected before official service request |
| Paid response includes full address | API and Kotlin show maximum 3 letters per address segment, all digits `*` |
| Provider sends a photo | API returns only `photoAvailable=true`; client never receives photo bytes |
| User has not acknowledged official data | DB lock is not created |
| User confirms from paid AR account and official record matches | One atomic, server-authorized attestation |
| Unpaid account | Confirmation rejected |
| Provider DNI/sex different from registered profile | Reject without writing identity lock |
| Ordinary authenticated SQL UPDATE of confirmation fields | Rejected |
| Service-role direct UPDATE of already-confirmed identity | Rejected by trigger |
| UPDATE to `profiles.first_name` or `last_name` after lock | Rejected by trigger |
| UPDATE `patients.address` after lock | Allowed for patient's own record via RLS |
| Attempt to change `care_country=BR` after lock | Rejected |
| Attempt to change `renaper_photo_sha256` after lock | Rejected |
| Multiple parallel confirmation requests | At most one succeeds; others fail after row lock |
| Invalid/missing photo bytes | No raw photo saved; hash nullable |
| Cancelled or closed Android screen | No persistence of unconfirmed RENAPER result |
| Mobile restart after confirmation | Confirmed timestamp reloaded from server; no stale local flag |

## Release gates
- SQL migration rehearsal on staging and row-level regression scripts.
- Vitest API unit + route tests, Kotlin JUnit/MockWebServer, Android Gradle build and real-device smoke.
- Security review of `service_role` access, DB policies and triggers, audit strategy, official integration scope.
- Separate explicit approval before applying migration or publishing APK; never apply to BR and never auto-declare biometric identity verification.

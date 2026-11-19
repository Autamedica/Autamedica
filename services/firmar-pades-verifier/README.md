# FirmAR PAdES verifier — isolated reference implementation

**Status: NOT DEPLOYED / NOT APPROVED FOR PRODUCTION.**
This isolated component is deliberately separate from the Cloudflare/Astro application:
it validates a *real* PDF CMS/PAdES signature, not a PDF stamp, API flag or QR.

It is not enough to set a feature flag. The following must be completed **before**
enabling the FirmAR callback:
1. Secure and independently authenticate an approved Argentine PKI trust anchor;
   compare the complete PEM/DER file SHA-256 against the reviewed fingerprint.
2. Provide `FIRMAR_AR_TRUST_ROOT_FILE` and `FIRMAR_AR_TRUST_ROOT_SHA256`,
   and `FIRMAR_PADES_INTERNAL_TOKEN` (random value of at least 32 characters).
3. Restrict the verifier to private HTTPS access by AutaMedica's backend,
   enforce authentication, rate limiting and size limits. Never expose the
   verifier itself through a public open endpoint.
4. Restrict all verifier container **egress** to the vetted Argentine PKI
   CRL/OCSP endpoints; untrusted certificate AIA URLs otherwise pose SSRF risk.
5. Confirm the official FirmAR callback schema and whether PFDR emits a
   verifiable trusted timestamp. This implementation REJECTS signatures without
   a validated timestamp and PDFs not incrementally signed without changing
   any byte of the original clinical snapshot.
6. Validate positive and negative test fixtures from FirmAR homologation:
   valid PAdES, modified content, wrong CUIL, expired/revoked certificates,
   broken or unavailable OCSP/CRL, expired sessions, and replay.
7. Ensure the production Cloudflare route, database migrations, and storage
   access/transaction policies are tested end-to-end and formally reviewed.
8. Do not set `FIRMAR_ENABLED` or `FIRMAR_INTEGRATION_APPROVED` before official
   authorization and internal security review.

Reference launch (only in an appropriately isolated test environment):

```bash
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8765 --no-access-log
```

POST `/verify-pades` with `Authorization: Bearer <private service token>`
and JSON `signedPdfBase64`, `originalPdfBase64`,
`expectedOriginalSha256` and `expectedSignerCuil`.
This endpoint never signs anything and never issues official credentials.

The signer certificate's subject serial number is checked against the
expected doctor's CUIL. A mismatch is rejected. The expected signer identity
comes from the existing restricted Supabase enrollment, never the browser.

**Do not treat these tests or this reference service as accredited Argentinian
signature validation or production integration.** Security/legal sign-off and
live homologation evidence are mandatory.

# AutaMedica — guest video token signing secret cutover (AR/BR)

## Verified on 2026-11-04

The production Cloudflare Pages projects `autamedica-web`, `autamedica-doctors`,
`autamedica-patients`, `autamedica-companies` and `autamedica-admin`
did **not** have `GUEST_TOKEN_SECRET` configured. Legacy code had a fixed
fallback signing key. That is unsafe: a publicly known key can allow
fabricated guest JWTs.

PR #676 removes the fixed fallback and refuses signing/verification unless a
strong, explicitly configured key exists. Deployment preflight requires the
encrypted binding on **all five** production Pages projects.

## Required manual operation — do not paste keys into chat or GitHub

1. Use a trusted local terminal/password-manager generator to create a
   cryptographically random **32-byte** key expressed as 64 hexadecimal
   characters. For example, locally: `openssl rand -hex 32`.
2. Open the Cloudflare Dashboard → Workers & Pages → `autamedica-web`
   → Settings → Variables and Secrets → Add. Choose **Production**,
   variable name `GUEST_TOKEN_SECRET`, select **Encrypt**, and save.
3. Repeat for `autamedica-doctors`, `autamedica-patients`,
   `autamedica-companies`, `autamedica-admin` using **the same** random
   key, because guest tokens may be signed and checked on different origins.
   Do **not** create a new key per subdomain.
4. Check the five bindings by **name and type only**, never read, log,
   transmit, expose or copy the value to a PR.
5. Deploy the fixed code from PR #676 after all bindings exist. Cloudflare
   Pages needs a new deployment to pick up Pages Functions secrets. Confirm
   production deployment commit, healthy API routes, and JWT sign/verify
   using **synthetic guest and room data** with AR and BR flows.
6. Verify old tokens signed with the predictable legacy key are rejected.
   Confirm anonymous direct database INSERT remains blocked and no protected
   patient record is exposed through DNI or CPF.
7. Document validation timestamps, commit hashes and synthetic test outcome.
   Rotate again if any uncertainty remains about prior exposure.

## Availability / compatibility

At the time of the initial production inspection, one guest request was in
`matched` state. Rotating the signing key invalidates previously issued guest
tokens, and that patient may need to open a new invite. Check the number of
active sessions before cutover and notify the care team.

If the new secret is not configured, the fixed code **fails closed**:
pharmacy guest request and guest room endpoints may return 503/500 rather
than silently accept a predictable key. Do not merge/deploy before encrypted
bindings are verified.

## Never claim complete clinical issuance from this cutover

This change secures access tokens only. It does not activate Farmalink AR,
Memed BR, FirmAR or a legally signed medical PDF. Homologation and separate
AR/BR clinical E2E tests remain required.

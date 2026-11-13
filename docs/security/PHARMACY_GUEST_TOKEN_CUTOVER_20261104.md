# AutaMedica — shared guest video token signing secret cutover

## Production runtime audit — 2026-11-13

The guest token resolver now fails closed: it accepts only an explicitly configured
64–128 character hexadecimal signing key. There is no predictable fallback.

Cloudflare Pages configuration and a non-writing live runtime probe established:

| Pages project | Portal / domain | Encrypted binding | Live invalid-token probe |
|---|---|---:|---:|
| `autamedica-web` | `www.autamedica.com` | Present | HTTP 401 |
| `autamedica-doctors` | `doctor.autamedica.com` | Present | HTTP 401 |
| `autamedica-patients` | `paciente.autamedica.com` | Missing | HTTP 500 |
| `autamedica-companies` | `empresa.autamedica.com` | Missing | HTTP 500 |
| `autamedica-admin` | Pages project URL | Missing | HTTP 500 |

The probe sends a deliberately invalid synthetic bearer token to the guest bootstrap
route. HTTP 401 means the runtime resolved the signing secret and rejected the fake
token; HTTP 500 means the runtime could not resolve the secret. The probe does not
create a dispatch, access patient data, or write to Supabase.

The root cause was an incomplete rotation workflow: it updated only Web and Doctors,
while production deployment preflight already requires the encrypted binding in all
five Pages projects. The updated workflow now writes the same freshly generated key
to all five projects and to the Supabase Edge Function environment, then verifies
binding metadata without reading back secret values.

## Required coordinated cutover

**Do not rotate while guest calls or dispatches are active.** Guest tokens have a
two-hour lifetime; rotating the shared HMAC key invalidates previously issued tokens.

At the 2026-11-13 audit, a read-only production aggregate found:
- 3 calls in `ringing`
- 2 pharmacy dispatches in `in_call`
- 1 pharmacy dispatch in `matched`

Repeat the aggregate immediately before cutover. Wait until the care team confirms
these interactions have ended or expired. Do not cancel or modify clinical records
to make the count reach zero.

Once no active interactions remain:

1. Run GitHub Actions workflow **Rotate shared guest-call HMAC secret** and provide
   the exact confirmation input `ROTATE`. The workflow generates a cryptographically
   random 32-byte key in memory; never paste a key into chat, PRs, terminal output,
   or logs.
2. The workflow configures the same value as encrypted `GUEST_TOKEN_SECRET` in
   `autamedica-web`, `autamedica-doctors`, `autamedica-patients`,
   `autamedica-companies`, `autamedica-admin`, and the Supabase project. It also
   enables `SFU_SESSION_BINDINGS_ENABLED=true` and verifies the secret names and
   Cloudflare `secret_text` binding types.
3. Run the production deployment workflow after the secret-presence preflight passes,
   so all Pages Functions receive the updated bindings in a fresh deployment.
4. Repeat the non-writing invalid-bearer probe on all five deployed portals. Each
   configured runtime must reject the synthetic token with HTTP 401, not 500.
5. Run the synthetic AR/BR guest-intake and call-token tests. Confirm that request
   creation remains blocked for missing country and that no real patient, doctor,
   or clinical record was created by the test.

Never restore a hardcoded or predictable signing fallback. If a deployment fails,
keep the fail-closed behavior, correct the encrypted binding, and redeploy with the
same shared secret. Do not create independent keys per subdomain.

## Scope and clinical boundaries

This cutover secures guest JWT issuance and verification only. It does not activate
Farmalink AR, Memed BR, FirmAR, or a legally signed medical PDF. Provider
homologation and separate AR/BR clinical E2E validation remain required.

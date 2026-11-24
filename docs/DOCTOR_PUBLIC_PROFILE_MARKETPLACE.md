# Doctor Public Profiles & Marketplace

Status: implementation kickoff
Branch: `feat/doctor-public-profiles-marketplace`
Base: `main` at `eda686dd018eff1bc076954627745fa2f3d4fc15`

## Product objective

Give every eligible AutaMedica clinician a shareable public professional page that can become an acquisition channel and, later, a booking entry point. The public page is separate from the authenticated doctor portal and must never expose clinical or private account data.

Initial URL target:
- `/ar/medicos/{slug}-{doctorId}`
- `/br/medicos/{slug}-{doctorId}`

The country segment is the clinician's care jurisdiction, not the visitor's browser locale.

## Non-negotiable safety rules

1. A profile is not public merely because a doctor account or `doctors` row exists.
2. Publication requires explicit doctor opt-in and completed clinical credential approval.
3. Public eligibility must use the same central predicate as dispatch: `app_private.is_doctor_dispatch_approved(doctor_id)`.
4. Public responses use an allowlist. Never serialize whole `doctors`, `profiles`, or `doctor_licenses` rows.
5. Never expose email, phone, CPF, payout details, signature/stamp URLs, patient data, credential evidence, internal IDs beyond the opaque public URL identifier, or admin review notes.
6. No appointment booking is enabled until a server-side booking contract, availability rules, idempotency, and patient consent are verified.
7. Do not publish ratings or testimonials until they are tied to completed consultations and moderation rules exist.
8. Pages must be `noindex` until explicit publication is enabled and verified.

## Phase 1 scope

- Explicit public-profile opt-in and publication state.
- Country-specific public route and canonical URL.
- Server-side lookup by opaque doctor ID.
- Server-side eligibility check using the central clinical approval predicate.
- Strict public DTO allowlist.
- SEO metadata and Person/Physician structured data only from verified public fields.
- Shareable profile link and WhatsApp share action.
- No public booking, reviews, pricing promises, or availability claims in this phase.

## Data contract to implement

A dedicated public-profile record (preferred) or equivalent fields with explicit consent:

- `doctor_id` (unique FK)
- `is_published` (boolean, default false)
- `display_name` (doctor-controlled, moderated)
- `public_bio`
- `public_city`
- `public_region`
- `public_languages`
- `public_avatar_path` (private storage path; signed/public delivery policy decided separately)
- `public_slug` (unique)
- `consented_at`
- `updated_at`

Do not reuse internal `doctors.bio` or `profiles.avatar_url` as public consent. Existing fields were not designed as publication consent.

## Server-side publication predicate

A page can render only if all conditions hold:

- Public-profile record exists and `is_published = true`.
- Doctor is active.
- `app_private.is_doctor_dispatch_approved(doctor_id)` returns true.
- Doctor country is AR or BR and matches the URL prefix.
- License number is non-empty and not a PENDING placeholder.
- Required public display fields pass validation.

If the predicate cannot be evaluated, fail closed and return not found/noindex.

## Phase 2 (separate follow-up)

- Public availability and appointment booking.
- Booking idempotency and collision protection.
- Confirmations, cancellations, reminders, and waitlist.
- Verified post-consultation reviews.
- Profile analytics and attribution.
- Embeddable booking widget.

Each requires its own backend contract and tests; do not simulate these features in the public page.

## Acceptance criteria

- Unpublished, pending, inactive, or wrong-country clinicians return 404 and noindex.
- A published, approved AR doctor appears only under `/ar/`; BR only under `/br/`.
- A browser locale switch never changes legal jurisdiction or currency.
- Public HTML and JSON contain only allowlisted public fields.
- Anonymous access cannot enumerate unpublished clinicians.
- No patient/clinical data or private credential evidence is present in HTML, JSON-LD, metadata, logs, or analytics.
- Doctor can preview, publish, unpublish, and revoke consent.
- Automated tests cover authorization, country mismatch, opt-out, inactive doctor, and missing approval.

## Implementation sequence

1. Schema and RLS for explicit publication consent.
2. Shared server-side publication service and DTO.
3. Public SSR route, metadata, JSON-LD, and share link.
4. Doctor portal controls for preview/publish/unpublish.
5. E2E and security regression.
6. Only then implement booking, reviews, and growth analytics.

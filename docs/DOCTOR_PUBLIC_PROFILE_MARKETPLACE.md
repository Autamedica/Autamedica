# Public Doctor Profiles

Status: implementation in PR #878
Branch: `feat/doctor-public-profiles-marketplace`
Base: `main` at `eda686dd018eff1bc076954627745fa2f3d4fc15`

## Product objective

Give eligible AutaMedica clinicians a shareable public professional page with an editorial presentation, verifiable credentials and a direct entry to the existing consultation intake. The public page is separate from the authenticated doctor portal and must never expose clinical or private account data.

Public routes:
- `/ar/medicos/{slug}-{doctorId}`
- `/br/medicos/{slug}-{doctorId}`

The country segment is the clinician's care jurisdiction. The visitor's UI locale is resolved independently.

## Publication and clinical eligibility

- The doctor controls visibility with `doctors.public_profile_enabled` in the professional profile editor.
- There is no separate publication-consent checkbox or version gate.
- A database trigger timestamps every transition to enabled, records the actor and writes an audit-log entry.
- A platform administrator can also enable/disable an individual profile through `PATCH /api/admin/doctors/public-profile`; the same database audit trigger applies.
- Publication still requires the existing central clinical eligibility predicate `app_private.is_doctor_dispatch_approved(doctor_id)`.
- If the database schema or eligibility predicate is unavailable, public rendering fails closed and the editor API returns a controlled unavailable response.

## Public DTO and privacy

Public responses use an allowlist. Never serialize whole `doctors`, `profiles`, or `doctor_licenses` rows.

Never expose email, phone, CPF, payout details, signature/stamp URLs, patient data, credential evidence, admin review notes, or private account data. Only approved public credential numbers and the existing public avatar URL may be returned.

## Editorial page

- Header: professional name, specialty, public photo when present, AR MN/MP or BR CRM/UF, and RQE where present.
- Sections: clinical practice, education, professional trajectory, academic activity and recognition.
- Optional sections render only when real content exists.
- RQE is displayed as a professional credential value, without a warning label or claim that it independently validates the CRM.
- CTA enters the existing consultation intake and carries `doctor_id` and `care_country` through patient registration. This is not a named-doctor booking contract.

## Verified patient feedback

The profile can show approved comments from `doctor_reviews` only when the linked appointment has status `completed`. Ratings and ranking scores are not exposed.

Visibility is governed independently by jurisdiction:
- `platform_operational_domains.public_doctor_testimonials_enabled` for AR
- `platform_operational_domains.public_doctor_testimonials_enabled` for BR

The platform administrator changes each flag through `PATCH /api/admin/doctors/public-profile-governance`, with a reason and an audit entry. Missing or disabled flags hide the section. No empty testimonial block is rendered.

## Database contract

The migration `20261124090000_add_public_doctor_profiles.sql` is additive and repeatable. It:
- Adds optional structured professional fields and publication state to `doctors`.
- Adds jurisdictional testimonial flags to the existing `platform_operational_domains` table.
- Creates a server-only allowlisted read RPC.
- Adds database-side publication timestamp and audit behavior.
- Adds an audited administrator RPC for AR/BR testimonial flags.
- Does not open anon/authenticated access to private doctor, profile or license tables.

Do not apply the migration to production until the PR checks are green and the deployment sequence is explicitly approved.

## SEO and acceptance criteria

- Public published profiles return canonical URLs, title, meta description and `schema.org/Physician` JSON-LD.
- Unpublished, pending, inactive, or wrong-country clinicians return 404 and noindex.
- A browser locale switch never changes legal jurisdiction or currency.
- Public HTML and JSON contain only allowlisted public fields.
- Anonymous access cannot enumerate unpublished clinicians.
- No patient/clinical data or private credential evidence is present in HTML, JSON-LD, metadata, logs or analytics.
- Doctor can preview, publish and unpublish through one visibility toggle.
- Admin can override publication and independently configure testimonial visibility by country.
- Unit tests cover minimum and populated profiles, AR/BR credentials, and jurisdictional testimonial flags.

## Not included

Public appointment booking, availability claims, cancellation/reminders, waitlist, rankings, ratings, analytics and embeddable booking widgets remain separate work. The profile CTA preserves the clinician context into the current intake, but it does not reserve a named doctor or slot.

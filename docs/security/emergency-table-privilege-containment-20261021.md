# Production emergency table privilege containment

## State at discovery, October 21 2026

A read-only privileges audit of Supabase production (`qxjjrpksmwwrmubhvjew`) identified the following dangerous privileges for `anon` and `authenticated`:

- `TRUNCATE`, `TRIGGER` and `REFERENCES` permitted on all **155** public base/partitioned tables, including tables with clinical data.
- `pharmacy_dispatch_requests` had `anon` SELECT and UPDATE grants and broad active-status RLS predicates. It stores patient identifiers, names, phone numbers and symptoms.

These grants were **a vulnerability**, not proof that anyone exploited them.

## Production migrations already executed

1. `20261021233845_contain_anon_kiosk_dispatch_pii_20261021`: revoked `anon`/PUBLIC SELECT and UPDATE on `public.pharmacy_dispatch_requests` while retaining INSERT and service-role access.
2. `20261021234110_revoke_untrusted_public_table_truncate_trigger_references_20261021`: revoked TRUNCATE, TRIGGER and REFERENCES from PUBLIC, anon, authenticated across public tables.

## Verification

- Initial audit: **155 of 155** public tables with dangerous API-role privileges.
- After change: **154 of 155** protected. One remains: `public.spatial_ref_sys`, a PostGIS extension table owned/granted by `supabase_admin`. The connected `postgres` role lacks permission to SET ROLE `supabase_admin` and cannot revoke the original owner's grant. **Do not misreport 155/155**.
- Additional extension-managed objects `net.http_request_queue` and `net._http_response` also have broad `PUBLIC` grants, including TRUNCATE. They belong to the `pg_net` extension and were not altered by the public-schema migration. Their schema `net` currently grants USAGE to API roles. Evaluate controlled vendor-supported remediation separately.
- Verified `anon` SELECT=false, UPDATE=false, INSERT=true on `pharmacy_dispatch_requests`, including a negative-role SQL probe. Service-role SELECT/UPDATE remains available.
- The exact privilege revocation loop passed a transactional regression test on AutaMedica Staging using synthetic grants on `public.profiles`. The staging transaction was rolled back; no synthetic users/clinical data were preserved.
- `supabase/tests/untrusted_table_privileges_smoke.sql` is a metadata-only repeatable regression probe.

## Remaining risks and rollout dependencies

- **Authenticated request disclosure/write:** Broad status-based SELECT/UPDATE RLS policies still allow data access outside the request owner or assigned doctor. PR #539 prepares a full scoped fix, but web/Android compatibility needs review. Do not conflate this with the completed anonymous grant containment.
- **Kiosk/Android compatibility:** An installed Android client that directly performs anonymous `INSERT ... RETURNING` or `SELECT` will no longer work in that flow. The currently deployed browser Express Consultation uses the signed-token server route. Test and update Android securely.
- The managed PostGIS / pg_net extension privileges must be reviewed with Supabase's supported ownership mechanism; do not try to modify extension objects by replacing system tables.
- Database REST APIs do not necessarily expose TRUNCATE directly. The risk is the underlying privilege, particularly via SQL-capable functions and future vulnerabilities.
- This PR mirrors changes **already live** in production; it should not be treated as a new blanket database migration without reconciling remote history.

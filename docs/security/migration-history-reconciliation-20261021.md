# AutaMedica — migration ledger vs repository (2026-10-21)

## Provenance and inventory

Compared `supabase_migrations.schema_migrations` in production project `qxjjrpksmwwrmubhvjew` against timestamped files under `supabase/migrations/` on GitHub.

- Database migrations recorded as applied: **194**.
- SQL migration files in repository before this audit: **188**.
- Unmatched production ledger versions: **6**, all from September 2026.
- The production project was NOT mutated during this comparison.

## Recovery status

| Version | Production ledger name | SQL in ledger | Recovery |
| --- | --- | --- | --- |
| `20260924210500` | NULL | 0 statements | **UNRECOVERED**; history marker, source unknown |
| `20260925010000` | NULL | 0 statements | **UNRECOVERED**; history marker, source unknown |
| `20260925020000` | allow_pharmacy_kiosk_and_patient_intake_rls | 0 statements | **UNRECOVERED**; must inspect pharmacy/kiosk and intake policies in actual production database |
| `20260925230000` | create_medications_br_cmed | 26 statements | Restored from Supabase migration ledger in this PR |
| `20260926150000` | regulatory_separation_crm_rs_ondemand_dispatch | 10 statements | **Partial reconstruction**: restored statements 1–7; omitted the three targeted test-user data updates from statements 8–10 |
| `20260927034000` | fix_dispatch_single_offer | 7 statements | Restored from Supabase migration ledger in this PR |

The reconstructed SQL comes from the production migration ledger, **not** from an inferred schema diff. The regulatory file is deliberately not byte-equivalent to the historical original because it excludes personally identifying test-user updates. Never restore those historical test-user updates by copying them blindly into a new environment.

## Important safety constraints

1. **This draft PR is NOT eligible for merge or full staging deployment yet.** The three zero-statement ledger entries must be classified. In particular, the missing pharmacy/kiosk migration could contain access-control policies not recorded in the ledger.
2. The new `AutaMedica Staging` project `qqevyncgnanpmvauehys` has a **minimal security fixture** and 3 independent staging-specific migrations. It does not represent the full production schema. It must not be treated as a clean target for `supabase db push --include-all`.
3. Perform migration dry-run against a **fresh, disposable database** or a safely reset (and separately authorized) staging target, with no real patient data. Apply migrations strictly in timestamp order, use no seed data from production, and capture every failure.
4. Verify schema parity of relevant tables/functions/RLS and synthetic doctor/patient/company flows before considering clinical rollout.
5. GitHub branch protection is not configured. Neither this PR nor the role-security PR should be auto-merged.
6. **Never run bulk migrations against production based on this reconstruction.**

## Next technical check

Inspect production grants/policies and the repo history for version `20260925020000`, then determine whether the two unnamed zero-statement versions were placeholder/repair entries. If they are confirmed history-only placeholders, document that finding explicitly before creating corresponding no-op migration files.

Any real staging secret must be configured through a securely stored GitHub Actions repository secret, not committed to source.

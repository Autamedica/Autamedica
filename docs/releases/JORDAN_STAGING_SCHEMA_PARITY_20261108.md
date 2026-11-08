# Jordan — staging vs production schema parity (read-only evidence)

**Release decision: NO-GO.** No payment flag, QR distribution, production DB migration, real patients or live PSP transactions are authorized by this audit.

## Scope and evidence

Read-only catalog inventory executed against Supabase production `qxjjrpksmwwrmubhvjew` and staging `qqevyncgnanpmvauehys` on 2026-11-08. Queries read only PostgreSQL metadata, no patient or billing rows. The reproducible query is [`supabase/tests/jordan_staging_schema_inventory_readonly.sql`](../../supabase/tests/jordan_staging_schema_inventory_readonly.sql), committed on the **integrated testing branch only**.

| Metric | Production | Staging |
|---|---:|---:|
| Relevant catalog entries (selected columns, triggers, RPC signatures) | 86 | 60 |
| Entries present only on one side | 29 | 3 |
| Additional same-name type/nullability mismatch | 1 | 1 |

A literal row diff includes 30 prod-not-in-staging and 4 staging-not-in-prod entries, because the single altered column counts once on each side. Counts only cover the named objects: **not** an entire database audit.

### Critical missing in staging

- `public.dispatch_offers` (8 inspected columns), so an accepted doctor R$40 offer cannot be simulated.
- `pharmacy_dispatch_requests.price_brl` and `.doctor_fee_brl`, needed for independent patient R$79 and doctor R$40.
- Request `patient_id`, `call_id`, `guest_invite_id`, plus `pharmacy_guest_dispatch_sessions` (5 inspected columns).
- Functions `match_dispatch_doctors(uuid)`, `assign_dispatch_patient_id()`, `guard_pharmacy_dispatch_update()`.
- Trigger set: `trg_match_dispatch_doctors`, `tr_dispatch_assign_patient_id`, `trg_guard_pharmacy_dispatch_update`, `trg_revoke_closed_pharmacy_guest_session`, and `zz_country_dispatch` on request/offer.

### Differences in staging only

- `app_private.guard_jordan_br_referral()` and active `zz_jordan_br_referral` trigger, missing from production.
- `claim_pharmacy_request_tier` signature is **(request_id, doctor_id)** on staging, **(doctor_id, request_id)** on production. Both UUID arguments: accidental positional calls could silently swap meaning.
- `pharmacy_dispatch_requests.search_timeout_at` is NOT NULL on staging, nullable on production.

### Migration history split — sampled versions >= 20261104

Production contains the original dispatch chain:

```text
20261105045000 gate_clinical_dispatch_by_admin_approval
20261105050000 persistent_pharmacy_dispatch_queue
20261105060000 guard_clinical_dispatch_offers
20261105070000 patient_queue_actions
20261105080000 guest_pharmacy_queue_recovery
20261105090000 public_country_radar_capacity
20261105100000 guard_admin_approval_runtime_gates
20261105110000 protect_admin_clinical_validation_fields
20261105120000 patient_directory_only_approved_doctors
```

Staging has distinct Jordan experimental history:

```text
20261104210719 staging_jordan_dispatch_country_test_20261104
20261104210758 staging_jordan_br_dni_nullability_20261104
20261105001545 guard_jordan_br_only_referrals
```

Other historic migration versions (AR certificates, commercial referral ledger and B2C CRM) differ even when their migration names look similar. **Never decide an existing migration was applied based on matching its human-readable name.**

## Implementation order / evidence required

1. Snapshot and inventory both environments, PostgreSQL extensions, RLS, trigger order, grants, enum/check constraints, migration versions and dependent RPC callers; preserve historical applied migrations (do not rename them).
2. Provision a **new, disposable local database**, replay the reviewed full repository migrations in order from a known baseline. Resolve historical differences and compiler/permission errors there; do not directly `db push` to the current staging.
3. Run and record the isolated rollback-only fixtures for Jordan R$79/40, Brasil-only, verified-first-person identity, refund/reversal, approved/pending PSP TEST and SFU session/room binding; test both web and Android when integration source is ready.
4. Only after the disposable baseline passes, plan a separate migration reconciliation for existing staging that preserves its AR/Farmalink/Memed and unrelated clinical data. Compare target catalog and `schema_migrations` again.
5. Obtain independent approval for staging changes, rerun the same catalog inventory against staging and the disposable target, attach migration logs, typecheck and CI. Production migration and `ENABLE_JORDAN_PAYMENTS` are **separate later go/no-go decisions**.

**Current evidence:** catalog SQL executed and returned 86/60 rows. Full SQL replay, CircleCI pipeline, PSP TEST and Android device test have NOT been executed. No production writes performed.

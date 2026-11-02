# Backup and isolated recovery runbook

## Evidence status — 2026-11-02

The [production database-only drill passed](https://github.com/ecucondorSA/Autamedica/actions/runs/41381103309): 226 tables and 106,411 rows matched, 317 foreign keys were verified, and data/security metadata plus exact table permission facts matched the source snapshot. Three destination permission objects required reconciliation to the source facts. The source was read-only, the restore destination was offline, and cleanup was verified. Restore plus validation took 8.85 seconds; the complete measured drill took 641.86 seconds, including export and disposable stack setup/cleanup.

Full platform recovery is **not yet accredited**. This drill retained no backup and excludes Storage object bytes, Vault secrets and external platform configuration. The historical 2026-04-02 report of unavailable managed backups/PITR still requires an authenticated dashboard recheck before selecting a retention strategy. These timings do not establish a full platform RPO/RTO commitment.

## Export and retain

**Current-source limitation:** the legacy three-file exporter below is an integrity/export tool, not an accredited recovery format for the current production database. Production has historical rows under a `NOT VALID` check constraint. Loading the entire schema before its data re-enforces that check against those historical rows. A retained recovery strategy must use native pre-data/data/post-data ordering (or a supported archive/PITR restore), retain the same-snapshot source permission facts needed for exact ACL replay, and pass a retained-copy drill; never remove the guard or change clinical records to make a restore pass.

Prerequisites: Bash, Supabase CLI (validated CI version: 2.122.0), Docker, gzip and GNU coreutils. Obtain the production **direct or session-pooler** database connection through the approved secret store; do not use a transaction pooler. Keep credentials out of shell history, git and logs. Run with shell tracing disabled.

1. Provision an encrypted, access-restricted backup location.
2. Set `DATABASE_URL` or `SUPABASE_DB_URL` through the secret store and optionally `BACKUP_DIR`.
3. Run `bash scripts/db/create-supabase-logical-backup.sh`.
4. Run `bash scripts/db/verify-supabase-logical-backup.sh BACKUP_DIRECTORY`.
5. Copy the completed directory to encrypted off-site storage; verify it again after transfer.

The exporter creates a private staging directory, requires all three non-empty exports, checks compressed streams and records SHA-256 checksums before publishing a completed directory. A failure removes its unpublished files. Interrupted processes killed with SIGKILL may leave a hidden `.partial-*` directory; it is not a completed backup.

Completed directories contain `roles.sql.gz`, `schema.sql.gz`, `data.sql.gz` and `SHA256SUMS`. The directory is mode 700 and files are mode 600. Checksums detect corruption; they do not establish authenticity against an attacker able to replace both payload and manifest. Do not commit or upload database exports as public CI artifacts.

**Consistency limitation:** these are three separate CLI exports, without one shared snapshot. For a clinically usable recovery point, coordinate a maintenance window that pauses application writes, scheduled writers and schema changes for the entire export, or use a supported snapshot/PITR strategy. Record the method and times. Do not call a normal live export a proven consistent recovery point.

## Automated database-only drill

Run the **Production database recovery drill** workflow manually from `main`. Existing encrypted `SUPABASE_DB_URL` and `SUPABASE_DB_PASSWORD` secrets must reference the fixed production session endpoint. PR runs execute guard tests without production credentials.

The script exports roles without passwords and uses one read-only exported snapshot for schema, table fingerprints, metadata, foreign-key checks and data. It includes Auth/Storage schemas and migration rows in the logical restore. It restores into a fresh PostgreSQL 17 Supabase container after stopping local application services, disabling cron and disconnecting every container network. The restore helper cannot address a remote destination.

The destination image is pinned to the production build verified through management metadata (`17.6.1.084`). Before exporting application data, the empty destination must install every source extension at its exact version and schema, including required dependencies. A source build change requires reviewing this pin; never bypass the version checks or skip an extension to obtain a pass.

The drill restores four private components in one transaction: roles, native `pre-data` schema, data, then native `post-data` schema. Both schema sections and data share the source snapshot. This preserves the exact validation state of historical `NOT VALID` constraints while keeping their protection for new writes. A disposable integer-only fixture first proves that behavior. Faithful restoration does not validate the clinical provenance or signatures of historical records.

The tested format also includes table permission facts captured in that same snapshot and held privately in memory. After the native restore, a second offline transaction reconciles only objects whose owner or ACL differs, preserving source grantors and grant options and removing extra access. Exact facts and the original security metadata hash must both match afterwards. A second integer-only fixture verifies missing grants, grant options and removal of extra access. These facts are required recovery inputs, not merely validation hashes; the four SQL files alone are not the complete tested format.

Fingerprint and security comparisons cover `public`, `app_private`, `growth_os`, `auth` and `storage`. Four historical certificates fail the source's new signature-evidence check; they were preserved unchanged under the existing `NOT VALID` constraint. Their signatures remain outside this recovery accreditation and require a separate review.

Success requires matching full-row fingerprints/counts, table owners, RLS/policies, grants, user function definitions, triggers and constraint definitions, plus zero foreign-key violations in source and target. The report appears only after the temporary stack has been removed and private host files have been deleted. Any mismatch or cleanup failure fails the drill.

No SQL dump or private diagnostic artifact is uploaded. The copy is deliberately destroyed; this workflow **does not implement backup retention or restore from an off-site retained copy**. It excludes Storage object bytes, Vault secrets and external platform configuration. Its restore/validation and total-drill timings are observations, not a complete platform RTO or an RPO commitment.

## Isolated restoration drill

The manual three-file example below applies only to a compatible legacy source. It is not the current production drill; use the automated native-section procedure above for this source.

Use an approved, fresh Supabase instance with PostgreSQL 17 and compatible Auth/Storage schemas and extensions. Keep outbound network access disabled and application workers, scheduled tasks, email, SMS and webhooks stopped. Restored data must remain under the same access controls as production. The procedure below never calls production as a restore target.

1. Record incident/drill start, export start/end, source PostgreSQL and CLI versions, enabled extensions, and the recovery-point consistency method.
2. Confirm the target connection independently against the isolated instance inventory. Do not reuse the source URL variable. Verify that no application data already exists in the target; stop if the target identity or emptiness is uncertain.
3. Verify the encrypted off-site copy with the integrity script.
4. In a private encrypted working directory, set `umask 077` and decompress the three files. Do not execute SQL from an untrusted backup.
5. Set `RESTORE_DATABASE_URL` from the isolated target secret store. Restore using the documented Supabase ordering:

```bash
# Execute from the private directory containing the decompressed files.
psql --no-psqlrc --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql --dbname "$RESTORE_DATABASE_URL"
```

Any SQL failure invalidates the drill; retain restricted diagnostic evidence and repair compatibility before repeating against a fresh target. Do not drop production schemas or suppress restore errors to obtain a successful result.

## Acceptance and measurements

Before releasing the isolated environment for testing:

- Compare source/restore table counts and ordered primary-key digests captured during the same quiesced recovery point; include `auth.users`, profiles, patients, doctors, appointments, medical records and prescription tables. Do not publish patient identifiers or clinical content.
- Compare functions, triggers, constraints, extensions, sequences, RLS flags/policies and grants. Check foreign-key validity explicitly: importing with replica mode bypasses enforcement, and a successful import alone does not prove referential integrity.
- Run the existing RLS and privileged-function tests on the restored target after inspecting their prerequisites. The session-cleanup fixture test requires an empty table and is only for a disposable synthetic database, never a restored clinical dataset.
- Test authentication, access isolation and document retrieval through the isolated application, with authorized personnel. Prevent external messages, prescriptions or payments.
- Record restore command start/end, validation end, pass/fail results and blockers. Report restore duration separately from total recovery duration. Derive RPO from the last consistent recovery point, not from the file creation timestamp.
- Securely destroy temporary plaintext and the drill instance according to the approved retention process.

A database export does not contain Storage object bytes, deployed Edge Functions, JWT/API secrets, OAuth/SMTP configuration or DNS. These require separate backup/configuration and recovery tests. A database-only drill cannot certify full platform recovery.

Official reference: [Supabase platform-to-self-hosted restore](https://supabase.com/docs/guides/self-hosting/restore-from-platform).


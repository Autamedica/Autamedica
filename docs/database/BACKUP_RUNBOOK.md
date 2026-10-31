# Backup and isolated recovery runbook

## Evidence status — 2026-10-31

Production recovery is **not yet accredited**. Export integrity checks and synthetic orchestration tests do not constitute a production backup restore or an RPO/RTO measurement. The historical 2026-04-02 report of unavailable managed backups/PITR must be rechecked in the dashboard before selecting a recovery strategy.

## Export and retain

Prerequisites: Bash, Supabase CLI (validated CI version: 2.122.0), Docker, gzip and GNU coreutils. Obtain the production **direct or session-pooler** database connection through the approved secret store; do not use a transaction pooler. Keep credentials out of shell history, git and logs. Run with shell tracing disabled.

1. Provision an encrypted, access-restricted backup location.
2. Set `DATABASE_URL` or `SUPABASE_DB_URL` through the secret store and optionally `BACKUP_DIR`.
3. Run `bash scripts/db/create-supabase-logical-backup.sh`.
4. Run `bash scripts/db/verify-supabase-logical-backup.sh BACKUP_DIRECTORY`.
5. Copy the completed directory to encrypted off-site storage; verify it again after transfer.

The exporter creates a private staging directory, requires all three non-empty exports, checks compressed streams and records SHA-256 checksums before publishing a completed directory. A failure removes its unpublished files. Interrupted processes killed with SIGKILL may leave a hidden `.partial-*` directory; it is not a completed backup.

Completed directories contain `roles.sql.gz`, `schema.sql.gz`, `data.sql.gz` and `SHA256SUMS`. The directory is mode 700 and files are mode 600. Checksums detect corruption; they do not establish authenticity against an attacker able to replace both payload and manifest. Do not commit or upload database exports as public CI artifacts.

**Consistency limitation:** these are three separate CLI exports, without one shared snapshot. For a clinically usable recovery point, coordinate a maintenance window that pauses application writes, scheduled writers and schema changes for the entire export, or use a supported snapshot/PITR strategy. Record the method and times. Do not call a normal live export a proven consistent recovery point.

## Isolated restoration drill

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

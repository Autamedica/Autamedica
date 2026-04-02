# Backup Runbook

As of `2026-04-02`, this project does not have accessible managed backups or PITR enabled for production operations.

For the current plan, the safe backup path is:

1. Export a logical backup with `scripts/db/create-supabase-logical-backup.sh`
2. Store the generated files in encrypted off-site storage
3. Keep the database password outside the repo
4. Test restore in a non-production database before relying on the backup

Example:

```bash
export DATABASE_URL='postgresql://postgres:[PASSWORD]@db.qxjjrpksmwwrmubhvjew.supabase.co:5432/postgres'
bash scripts/db/create-supabase-logical-backup.sh
```

Artifacts produced:

- `roles.sql.gz`
- `schema.sql.gz`
- `data.sql.gz`

Do not commit generated backups to git.

#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: bash scripts/db/verify-supabase-logical-backup.sh BACKUP_DIRECTORY" >&2
  exit 1
fi
cd -- "$1"
for file in roles.sql.gz schema.sql.gz data.sql.gz SHA256SUMS; do
  [[ -f "$file" && ! -L "$file" && -s "$file" ]] || { echo "Missing or unsafe backup component: $file" >&2; exit 1; }
done
# Hash only the fixed component names; never execute paths from an untrusted manifest.
sha256sum -- roles.sql.gz schema.sql.gz data.sql.gz | cmp -s -- SHA256SUMS -
gzip -t -- roles.sql.gz schema.sql.gz data.sql.gz
printf '%s\n' 'Backup integrity verified. Restore validation is still required.'

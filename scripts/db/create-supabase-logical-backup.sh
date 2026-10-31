#!/usr/bin/env bash
set -euo pipefail
umask 077

DB_URL="${DATABASE_URL:-${SUPABASE_DB_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "DATABASE_URL or SUPABASE_DB_URL is required." >&2
  exit 1
fi
for command in supabase gzip sha256sum mktemp; do
  command -v "$command" >/dev/null || { echo "Missing prerequisite: $command" >&2; exit 1; }
done

root_dir="${BACKUP_DIR:-$HOME/.local/share/autamedica/backups}"
mkdir -p -- "$root_dir"
chmod 700 -- "$root_dir"
root_dir="$(cd -- "$root_dir" && pwd)"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
partial_dir="$(mktemp -d "$root_dir/.partial-${timestamp}-XXXXXX")"
partial_name="${partial_dir##*/}"
target_dir="$root_dir/${partial_name#.partial-}"
cleanup() { if [[ -n "${partial_dir:-}" ]]; then rm -rf -- "$partial_dir"; fi; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Publish only after every export, compression and checksum succeeds.
supabase db dump --db-url "$DB_URL" --role-only -f "$partial_dir/roles.sql"
supabase db dump --db-url "$DB_URL" -f "$partial_dir/schema.sql"
supabase db dump --db-url "$DB_URL" --data-only --use-copy -f "$partial_dir/data.sql"
for file in roles schema data; do
  [[ -s "$partial_dir/$file.sql" ]] || { echo "Empty $file export; backup rejected." >&2; exit 1; }
  gzip -- "$partial_dir/$file.sql"
done
(
  cd -- "$partial_dir"
  gzip -t -- roles.sql.gz schema.sql.gz data.sql.gz
  sha256sum -- roles.sql.gz schema.sql.gz data.sql.gz > SHA256SUMS
)
mv -T -- "$partial_dir" "$target_dir"
partial_dir=""
printf 'Backup created and integrity checked: %s\n' "$target_dir"
printf '%s\n' 'Copy to encrypted off-site storage. A successful export does not prove recoverability.'

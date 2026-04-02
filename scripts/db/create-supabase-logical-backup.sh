#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DATABASE_URL:-${SUPABASE_DB_URL:-}}"
if [[ -z "${DB_URL}" ]]; then
  echo "DATABASE_URL or SUPABASE_DB_URL is required." >&2
  echo "Example: export DATABASE_URL='postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres'" >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
root_dir="${BACKUP_DIR:-$HOME/.local/share/autamedica/backups}"
target_dir="${root_dir}/${timestamp}"

mkdir -p "${target_dir}"
chmod 700 "${root_dir}" "${target_dir}"

echo "Writing logical backup to ${target_dir}"

supabase db dump --db-url "${DB_URL}" --role-only -f "${target_dir}/roles.sql"
supabase db dump --db-url "${DB_URL}" -f "${target_dir}/schema.sql"
supabase db dump --db-url "${DB_URL}" --data-only --use-copy -f "${target_dir}/data.sql"

gzip -f "${target_dir}/roles.sql" "${target_dir}/schema.sql" "${target_dir}/data.sql"

cat <<EOF
Backup created:
  ${target_dir}/roles.sql.gz
  ${target_dir}/schema.sql.gz
  ${target_dir}/data.sql.gz

Next step:
  Copy this directory to encrypted off-site storage.
EOF

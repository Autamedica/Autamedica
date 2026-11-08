#!/usr/bin/env bash
# Jordan SQL smoke runner. The caller must FIRST bootstrap/replay ALL reviewed
# migrations on a disposable local Supabase project. This script NEVER resets,
# creates, migrates or connects to any hosted database.
set -euo pipefail

if [[ "${AUTAMEDICA_JORDAN_DISPOSABLE:-}" != "true" ]]; then
  echo "BLOCKED: set AUTAMEDICA_JORDAN_DISPOSABLE=true for a newly created throwaway DB" >&2
  exit 3
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "BLOCKED: psql client required" >&2
  exit 3
fi

# Host and port are constrained to the default local Supabase CLI database.
# Never accept arbitrary DATABASE_URL, even with the disposable flag set.
readonly LOCAL_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
if [[ -n "${DATABASE_URL:-}" && "${DATABASE_URL}" != "${LOCAL_URL}" ]]; then
  echo "BLOCKED: DATABASE_URL must not override the disposable local endpoint" >&2
  exit 3
fi
# Supabase local Postgres uses port 54322. Credential belongs to local Docker.
# The custom setting is checked inside EVERY rollback-only synthetic fixture.
export PGOPTIONS="-c autamedica.isolated_test=on"

echo "Checking local schema only (127.0.0.1:54322)"
report="$(psql "${LOCAL_URL}" -X -v ON_ERROR_STOP=1 -qAt -F '|' \
  -f supabase/tests/jordan_release_readiness_readonly.sql)"
printf '%s\n' "${report}"
if printf '%s\n' "${report}" | grep -Eq '\|f$|\|false$'; then
  echo "BLOCKED: disposable schema not fully reconciled; migrate locally first" >&2
  exit 4
fi
if [[ -z "${report}" ]]; then
  echo "BLOCKED: no readiness report returned" >&2
  exit 4
fi

for file in \
  supabase/tests/jordan_br_79_40_dispatch_isolated.sql \
  supabase/tests/pharmacy_referral_commission_isolated.sql \
  supabase/tests/jordan_first_contact_commission_isolated.sql; do
  if [[ ! -f "${file}" ]]; then
    echo "BLOCKED: missing SQL smoke ${file}" >&2
    exit 4
  fi
  if ! grep -q 'autamedica.isolated_test' "${file}" || ! grep -Eq '^ROLLBACK;' "${file}"; then
    echo "BLOCKED: SQL smoke is not explicitly isolated and rolled back: ${file}" >&2
    exit 4
  fi
  echo "Running disposable rollback-only fixture: ${file}"
  psql "${LOCAL_URL}" -X -v ON_ERROR_STOP=1 -f "${file}"
done
echo "SQL smoke fixtures PASSED on disposable local project; no hosted DB written."

#!/usr/bin/env bash
set -euo pipefail
# Destructive reset is permitted only for the fresh, empty local CI database.
[[ "${CI:-}" == 'true' && "${AUTAMEDICA_ISOLATED_TEST:-}" == 'on' ]] || {
  echo 'Legacy migration test requires disposable CI isolation' >&2; exit 1;
}
unset PGSERVICE PGSERVICEFILE PGHOSTADDR
python3 - <<'PY'
import os
from urllib.parse import urlparse
url = os.environ.get('SUPABASE_DB_URL')
if url:
    parsed = urlparse(url)
    assert parsed.hostname in ('127.0.0.1','localhost','::1') and parsed.port == 54322
    assert not parsed.query and not parsed.fragment
else:
    assert os.environ.get('PGHOST') in ('127.0.0.1','localhost','::1')
    assert os.environ.get('PGPORT') == '54322'
PY
pg_cmd=(psql -X -v ON_ERROR_STOP=1)
if [[ -n "${SUPABASE_DB_URL:-}" ]]; then pg_cmd+=("$SUPABASE_DB_URL"); fi
export PGOPTIONS="${PGOPTIONS:-} -c autamedica.isolated_test=on -c statement_timeout=20000 -c lock_timeout=5000"
"${pg_cmd[@]}" -q -c "DO \$\$ BEGIN IF EXISTS(SELECT 1 FROM public.dispensation_orders) OR EXISTS(SELECT 1 FROM public.prescriptions) OR EXISTS(SELECT 1 FROM public.pharmacists) OR EXISTS(SELECT 1 FROM auth.users) THEN RAISE EXCEPTION 'empty_disposable_database_required'; END IF; END \$\$;"
legacy_test_dir=$(mktemp -d)
cleanup_legacy_test() {
  result=$?
  trap - EXIT
  if ! supabase db reset --local --no-seed >"$legacy_test_dir/reset-after.log" 2>&1; then
    cat "$legacy_test_dir/reset-after.log" >&2
    result=1
  fi
  rm -rf -- "$legacy_test_dir"
  exit "$result"
}
trap cleanup_legacy_test EXIT
# This version includes clinical-country guards but precedes pharmaceutical
# care_country columns. It is a local disposable reset, never a hosted downgrade.
if ! supabase db reset --local --no-seed --version 20261101180139 >"$legacy_test_dir/reset-before.log" 2>&1; then
  cat "$legacy_test_dir/reset-before.log" >&2
  exit 1
fi
"${pg_cmd[@]}" -f supabase/tests/pharmacy_legacy_migration.sql
echo 'Nonempty pharmacy migration: original clinical rows preserved and quarantined'

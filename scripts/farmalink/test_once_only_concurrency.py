#!/usr/bin/env python3
"""Real PostgreSQL connections, synthetic fixtures, no HTTP. Loopback DB only."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import subprocess
from threading import Barrier
from urllib.parse import urlsplit

DB_URL = os.environ.get('SUPABASE_DB_URL', '')
parsed = urlsplit(DB_URL)
if (parsed.scheme not in ('postgres', 'postgresql')
        or parsed.hostname not in ('127.0.0.1', 'localhost', '::1')
        or parsed.port != 54322 or parsed.path != '/postgres'
        or os.environ.get('CI') != 'true'):
    raise SystemExit('Refusing fixtures outside CI disposable loopback Supabase:54322')

passed = 0
fixtures = []


def sql(query, *, denied=False):
    result = subprocess.run(
        ['psql', '-X', DB_URL, '-qAt', '-v', 'ON_ERROR_STOP=1'],
        input=query, text=True, capture_output=True, timeout=40,
    )
    if denied:
        assert result.returncode != 0, 'Unauthorized operation succeeded'
        assert ('permission denied' in result.stderr
                or 'farmalink_server_role_required' in result.stderr
                or 'farmalink_prescription_not_eligible' in result.stderr
                or 'farmalink_missing_vendor_id' in result.stderr
                or 'farmalink_snapshot_immutable' in result.stderr
                or 'farmalink_unconfirmed_vendor' in result.stderr), result.stderr
        return None
    assert result.returncode == 0, result.stderr
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    return lines[-1] if lines else ''


def check(label, value):
    global passed
    assert value, label
    passed += 1
    print(f'PASS {label}', flush=True)


def fixture():
    source = Path('supabase/tests/farmalink_once_only_issue.sql').read_text()
    setup = source.split('SET LOCAL ROLE service_role;')[0]
    result = json.loads(sql(setup + '\nSELECT row_to_json(f) FROM farmalink_fixture f;\nCOMMIT;'))
    fixtures.append(result)
    return result


def claim(f, actor=None, role='service_role', denied=False):
    actor_sql = f"'{actor or f['uid']}'" if actor != 'NULL' else 'NULL'
    return sql(f"BEGIN; SET LOCAL ROLE {role}; SELECT public.claim_farmalink_issue("
               f"'{f['prescription_id']}',repeat('a',64),{actor_sql},'{{}}'::jsonb); COMMIT;", denied=denied)


def record(f, attempt, state, vendor='NULL', code='NULL', denied=False):
    return sql(f"BEGIN; SET LOCAL ROLE service_role; SELECT public.record_farmalink_issue("
               f"'{f['prescription_id']}','{attempt}','{state}','{f['uid']}',{vendor},{code}); COMMIT;",
               denied=denied)


f = fixture()
barrier = Barrier(10)


def contender(_):
    barrier.wait(timeout=10)
    # Hold the prescription row lock until COMMIT, forcing competing sessions to wait.
    query = (f"BEGIN; SET LOCAL ROLE service_role; SET LOCAL lock_timeout='15s'; "
             f"SELECT public.claim_farmalink_issue('{f['prescription_id']}',repeat('a',64),'{f['uid']}','{{}}'::jsonb); "
             "SELECT pg_sleep(0.2); COMMIT;")
    return json.loads(sql(query))


with ThreadPoolExecutor(max_workers=10) as pool:
    claims = list(pool.map(contender, range(10)))
check('10 concurrent connections: exactly one winner and nine blocked',
      sum(c['claimed'] is True for c in claims) == 1
      and sum(c['claimed'] is False for c in claims) == 9)
attempt = claims[0]['attempt_id']
check('all contenders retain the same attempt identity', len({c['attempt_id'] for c in claims}) == 1)
# All issuing processes have exited. A fresh process cannot retransmit.
check('process restart after durable reservation blocks another alta',
      json.loads(claim(f)) == {'claimed': False, 'attempt_id': attempt, 'state': 'reserved'})
sql(f"BEGIN; SET LOCAL ROLE service_role; SELECT public.claim_farmalink_issue('{f['prescription_id']}',repeat('a',64),'{f['uid']}',jsonb_build_object('changed',true)); COMMIT;", denied=True)
check('stale clinical snapshot rejected before transmission', True)
sql(f"UPDATE public.prescriptions SET clinical_data=jsonb_build_object('changed',true) WHERE id='{f['prescription_id']}';", denied=True)
check('clinical content cannot change after a reservation', True)
sql(f"UPDATE public.prescriptions SET vendor_name='farmalink',vendor_id='9600000002991' WHERE id='{f['prescription_id']}';", denied=True)
check('unconfirmed remote validation cannot be asserted on a prescription', True)
check('wrong attempt cannot persist a response',
      record(f, '00000000-0000-4000-8000-000000000000', 'unknown') == 'f')
check('failed persistence preserves original reservation', json.loads(claim(f))['claimed'] is False)
check('timeout/504 outcome persists unknown', record(f, attempt, 'unknown') == 't')
check('unknown blocks another alta after reconnect', json.loads(claim(f))['state'] == 'unknown')
check('unknown cannot be confirmed via ordinary result RPC',
      record(f, attempt, 'confirmed', "'9600000002991'", "'00'") == 'f')
claim(f, actor=f['other_uid'], denied=True)
check('different physician denied', True)
claim(f, actor='NULL', denied=True)
check('missing actor denied', True)
for role in ('anon', 'authenticated'):
    claim(f, role=role, denied=True)
    sql(f'BEGIN; SET LOCAL ROLE {role}; SELECT * FROM public.farmalink_issue_attempts; COMMIT;', denied=True)
    check(f'{role} cannot call claim or read reservations', True)

# Simulate legacy corrupt rows only in this synthetic database. Do not disable
# production guards: every UPDATE below is scoped to these generated fixture IDs.
def mutate(query):
    sql('BEGIN; SET LOCAL session_replication_role=replica; ' + query + '; COMMIT;')


for label, change, restore in (
    ('BR prescription', "UPDATE public.prescriptions SET country_code='BR' WHERE id='{rx}'",
     "UPDATE public.prescriptions SET country_code='AR' WHERE id='{rx}'"),
    ('BR patient', "UPDATE public.patients SET care_country='BR' WHERE id=(SELECT patient_id FROM public.prescriptions WHERE id='{rx}')",
     "UPDATE public.patients SET care_country='AR' WHERE id=(SELECT patient_id FROM public.prescriptions WHERE id='{rx}')"),
    ('unknown patient country', "UPDATE public.patients SET care_country=NULL WHERE id=(SELECT patient_id FROM public.prescriptions WHERE id='{rx}')",
     "UPDATE public.patients SET care_country='AR' WHERE id=(SELECT patient_id FROM public.prescriptions WHERE id='{rx}')"),
    ('BR physician', "UPDATE public.doctors SET license_type='CRM',uf_brazil='RS' WHERE user_id='{uid}'",
     "UPDATE public.doctors SET license_type='MN',uf_brazil=NULL WHERE user_id='{uid}'"),
    ('inactive physician', "UPDATE public.doctors SET active=false WHERE user_id='{uid}'",
     "UPDATE public.doctors SET active=true WHERE user_id='{uid}'"),
    ('pending validation', "UPDATE public.profiles SET sss_validation_status='pending' WHERE user_id='{uid}'",
     "UPDATE public.profiles SET sss_validation_status='valid' WHERE user_id='{uid}'"),
    ('unvalidated exemption', "UPDATE public.profiles SET sss_validation_status='exempt' WHERE user_id='{uid}'",
     "UPDATE public.profiles SET sss_validation_status='valid' WHERE user_id='{uid}'"),
    ('missing REFEPS', "UPDATE public.doctors SET refeps_id=NULL WHERE user_id='{uid}'",
     "UPDATE public.doctors SET refeps_id='54123456789' WHERE user_id='{uid}'"),
):
    context = {'rx': f['prescription_id'], 'uid': f['uid']}
    mutate(change.format(**context))
    claim(f, denied=True)
    mutate(restore.format(**context))
    check(label + ' denied by DB claim', True)

approved = fixture()
approved_claim = json.loads(claim(approved))
check('first isolated claim accepted', approved_claim['claimed'] is True)
a = approved_claim['attempt_id']
record(approved, a, 'confirmed', "'9600000002991'", "'55'", denied=True)
check('nonapproval response cannot confirm a number', True)
check('approval is persisted before PDF work', record(approved, a, 'confirmed', "'9600000002991'", "'00'") == 't')
check('PDF failure/restart cannot authorize another alta',
      json.loads(claim(approved))['state'] == 'confirmed' and not json.loads(claim(approved))['claimed'])
check('confirmed state cannot be overwritten', record(approved, a, 'unknown') == 'f')
rejected = fixture()
r = json.loads(claim(rejected))
check('explicit rejection persists', record(rejected, r['attempt_id'], 'rejected', code="'55'") == 't')
check('explicit rejection cannot retransmit', not json.loads(claim(rejected))['claimed'])
# Fixtures intentionally survive only until CI destroys the entire disposable
# local database. Cleanup via DELETE would cascade into append-only clinical
# audit tables and correctly trigger prevent_safety_audit_mutation().
# Run this test LAST, after all other SQL suites and temporary backup checks.
# Never disable safety triggers or override immutable audit protections.
check('all created fixtures remain scoped to this disposable DB',
      len(fixtures) == 3 and all(x['prescription_id'] for x in fixtures))
print(json.dumps({'passed': passed, 'failed': 0, 'concurrent_requests': 10, 'winners': 1, 'blocked': 9}))

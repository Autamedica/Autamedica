#!/usr/bin/env bash
set -euo pipefail
# This test commits wholly synthetic rows so separate connections can see them.
# It must never run against hosted staging/production or an occupied database.
[[ "${CI:-}" == 'true' && "${AUTAMEDICA_ISOLATED_TEST:-}" == 'on' ]] || {
  echo 'Concurrency test requires disposable CI isolation' >&2; exit 1;
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
export PGOPTIONS="${PGOPTIONS:-} -c autamedica.isolated_test=on -c statement_timeout=15000 -c lock_timeout=5000"
# No cleanup runs until the empty-database/isolation checks have succeeded.
"${pg_cmd[@]}" -q -c "DO \$\$ BEGIN IF current_setting('autamedica.isolated_test',true)<>'on' OR EXISTS(SELECT 1 FROM public.dispensation_orders) OR EXISTS(SELECT 1 FROM public.prescriptions) OR EXISTS(SELECT 1 FROM public.pharmacists) THEN RAISE EXCEPTION 'empty_disposable_database_required'; END IF; END \$\$;"
pharmacy_test_dir=$(mktemp -d)
cleanup_pharmacy_test() {
  result=$?
  trap - EXIT
  # All workers are waited on before normal exit. Reset only the guarded local
  # disposable DB; audit/delivery immutability is never disabled for cleanup.
  if ! supabase db reset --local >"$pharmacy_test_dir/reset.log" 2>&1; then
    cat "$pharmacy_test_dir/reset.log" >&2
    result=1
  fi
  rm -rf -- "$pharmacy_test_dir"
  exit "$result"
}
trap cleanup_pharmacy_test EXIT
"${pg_cmd[@]}" -q -f supabase/tests/pharmacy_country_concurrency.sql >"$pharmacy_test_dir/setup.log"
run_claim() {
  local worker=$1
  "${pg_cmd[@]}" -q >"$pharmacy_test_dir/claim-$worker.log" <<SQL
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',pharmacy_ci_concurrency.id('user_$worker'),'role','authenticated')::text,false);
SET ROLE authenticated;
BEGIN;
DO \$\$ BEGIN
 UPDATE public.dispensation_orders SET pharmacy_id=pharmacy_ci_concurrency.id('pharmacy_$worker'),status='assigned'
 WHERE id=pharmacy_ci_concurrency.id('order_claim') AND pharmacy_id IS NULL AND status='pending';
 IF FOUND THEN
   INSERT INTO pharmacy_ci_concurrency.results VALUES('claim_assignment','$worker','success');
   PERFORM pg_sleep(1);
 ELSE INSERT INTO pharmacy_ci_concurrency.results VALUES('claim_assignment','$worker','conflict'); END IF;
END \$\$;
COMMIT;
SQL
}
run_claim a & pharmacy_worker_a=$!
run_claim b & pharmacy_worker_b=$!
wait "$pharmacy_worker_a"
wait "$pharmacy_worker_b"
"${pg_cmd[@]}" -q >"$pharmacy_test_dir/prepare.log" <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM pharmacy_ci_concurrency.results WHERE kind='claim_assignment' AND outcome='success')<>1
 OR (SELECT count(*) FROM pharmacy_ci_concurrency.results WHERE kind='claim_assignment' AND outcome='conflict')<>1 THEN
   RAISE EXCEPTION 'concurrent_claims_did_not_have_one_winner'; END IF;
END $$;
INSERT INTO pharmacy_ci_concurrency.fixture
SELECT 'winner_pharmacy',pharmacy_id FROM public.dispensation_orders WHERE id=pharmacy_ci_concurrency.id('order_claim');
INSERT INTO pharmacy_ci_concurrency.fixture SELECT 'winner_user',user_id FROM public.pharmacists WHERE pharmacy_id=pharmacy_ci_concurrency.id('winner_pharmacy');
INSERT INTO pharmacy_ci_concurrency.fixture SELECT 'winner_pharmacist',id FROM public.pharmacists WHERE pharmacy_id=pharmacy_ci_concurrency.id('winner_pharmacy');
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',pharmacy_ci_concurrency.id('winner_user'),'role','authenticated')::text,false);
SET ROLE authenticated;
UPDATE public.dispensation_orders SET pharmacy_id=pharmacy_ci_concurrency.id('winner_pharmacy'),status='assigned'
WHERE id=pharmacy_ci_concurrency.id('order_duplicate');
UPDATE public.dispensation_orders SET status='under_review' WHERE id IN(pharmacy_ci_concurrency.id('order_claim'),pharmacy_ci_concurrency.id('order_duplicate'));
INSERT INTO public.dispensation_validations(order_id,pharmacist_id,validation_type,result)
SELECT pharmacy_ci_concurrency.id('order_'||kind),pharmacy_ci_concurrency.id('winner_pharmacist'),validation,'pass'
FROM unnest(ARRAY['claim','duplicate']) kind CROSS JOIN unnest(ARRAY['patient_identity','prescriber_identity','medication_match','formulation_match','quantity_check','validity_check']) validation;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',pharmacy_ci_concurrency.id('user_d'),'role','authenticated')::text,false);
SET ROLE authenticated;
UPDATE public.dispensation_orders SET prescriber_verified=true,reconciliation_status='reconciled',clinician_decision='approved'
WHERE id IN(pharmacy_ci_concurrency.id('order_claim'),pharmacy_ci_concurrency.id('order_duplicate'));
RESET ROLE;
UPDATE public.prescriptions SET status='signed',signed_pdf_url='synthetic://concurrency/'||id::text||'.pdf'
WHERE id IN(pharmacy_ci_concurrency.id('rx_claim'),pharmacy_ci_concurrency.id('rx_duplicate'));
INSERT INTO app_private.pharmacy_prescription_release_evidence(prescription_id,doctor_id,patient_id,care_country,
 clinical_snapshot,signed_pdf_url,document_sha256,certificate_sha256,verifier_reference,provider_authorization_reference,verified_at,order_snapshot)
SELECT rx.id,rx.doctor_id,rx.patient_id,'AR',rx.clinical_data,rx.signed_pdf_url,repeat('0',64),repeat('1',64),
 'isolated-concurrency-no-real-signature','isolated-concurrency-no-real-provider',now(),
 jsonb_build_object('medication',o.medication,'formulation',o.formulation,'dose_mg_per_day',o.dose_mg_per_day,
 'quantity_units',o.quantity_units,'duration_days',o.duration_days,'prescription_type',o.prescription_type,
 'dispense_window_start',o.dispense_window_start,'dispense_window_end',o.dispense_window_end)
FROM public.prescriptions rx JOIN public.dispensation_orders o ON o.prescription_id=rx.id
WHERE rx.id IN(pharmacy_ci_concurrency.id('rx_claim'),pharmacy_ci_concurrency.id('rx_duplicate'));
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',pharmacy_ci_concurrency.id('winner_user'),'role','authenticated')::text,false);
SET ROLE authenticated;
UPDATE public.dispensation_orders SET status='approved_for_dispensation'
WHERE id IN(pharmacy_ci_concurrency.id('order_claim'),pharmacy_ci_concurrency.id('order_duplicate'));
SQL
run_delivery() {
  local kind=$1 worker=$2 event_expression='gen_random_uuid()'
  if [[ "$kind" == 'duplicate' ]]; then event_expression="pharmacy_ci_concurrency.id('event_duplicate')"; fi
  "${pg_cmd[@]}" -q >"$pharmacy_test_dir/$kind-$worker.log" <<SQL
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',pharmacy_ci_concurrency.id('winner_user'),'role','authenticated')::text,false);
SET ROLE authenticated;
BEGIN;
DO \$\$ BEGIN
 BEGIN
  INSERT INTO public.dispensation_events(id,order_id,pharmacist_id,pharmacy_id,dispense_status,
   dispensed_medication,dispensed_formulation,dispensed_quantity)
  VALUES($event_expression,pharmacy_ci_concurrency.id('order_$kind'),pharmacy_ci_concurrency.id('winner_pharmacist'),
   pharmacy_ci_concurrency.id('winner_pharmacy'),'dispensed','Synthetic','tablet',1);
  INSERT INTO pharmacy_ci_concurrency.results VALUES('$kind','$worker','success');
  PERFORM pg_sleep(1);
 EXCEPTION WHEN check_violation THEN
  INSERT INTO pharmacy_ci_concurrency.results VALUES('$kind','$worker','conflict');
 WHEN unique_violation THEN
  INSERT INTO pharmacy_ci_concurrency.results VALUES('$kind','$worker','duplicate');
 END;
END \$\$;
COMMIT;
SQL
}
for pharmacy_kind in claim duplicate; do
  run_delivery "$pharmacy_kind" a & pharmacy_worker_a=$!
  run_delivery "$pharmacy_kind" b & pharmacy_worker_b=$!
  wait "$pharmacy_worker_a"
  wait "$pharmacy_worker_b"
done
"${pg_cmd[@]}" -q <<'SQL'
DO $$
DECLARE v_kind text;
BEGIN
 FOREACH v_kind IN ARRAY ARRAY['claim','duplicate'] LOOP
  IF (SELECT count(*) FROM pharmacy_ci_concurrency.results r WHERE r.kind=v_kind AND outcome='success')<>1 THEN
    RAISE EXCEPTION 'delivery_race_must_have_one_success_%',v_kind; END IF;
  IF (SELECT count(*) FROM public.dispensation_events WHERE order_id=pharmacy_ci_concurrency.id('order_'||v_kind))<>1
     OR (SELECT status FROM public.dispensation_orders WHERE id=pharmacy_ci_concurrency.id('order_'||v_kind))<>'dispensed'
     OR (SELECT status FROM public.prescriptions WHERE id=pharmacy_ci_concurrency.id('rx_'||v_kind))<>'dispensed_total'
     OR (SELECT count(*) FROM public.pharmacy_audit_events WHERE order_id=pharmacy_ci_concurrency.id('order_'||v_kind) AND event_type='dispensation_executed')<>1 THEN
    RAISE EXCEPTION 'delivery_race_persisted_inconsistent_state_%',v_kind; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pharmacy_ci_concurrency.results WHERE kind='claim' AND outcome='conflict')
 OR NOT EXISTS(SELECT 1 FROM pharmacy_ci_concurrency.results WHERE kind='duplicate' AND outcome='duplicate') THEN
   RAISE EXCEPTION 'delivery_race_loser_did_not_report_expected_conflict_or_idempotency'; END IF;
END $$;
SELECT kind,worker,outcome FROM pharmacy_ci_concurrency.results ORDER BY kind,worker;
SQL
echo 'Independent-session pharmacy claims, delivery cap and UUID replay: passed'

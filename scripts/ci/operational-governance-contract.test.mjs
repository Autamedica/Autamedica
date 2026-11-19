import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const migration=readFileSync('supabase/migrations/20261114230216_operational_governance_center.sql','utf8');
const checkout=readFileSync('apps/web/src/pages/api/pharmacy/dispatch/payment/create.ts','utf8');
const status=readFileSync('apps/web/src/pages/api/admin/governance/status.ts','utf8');
const overview=readFileSync('apps/web/src/pages/api/admin/governance/overview.ts','utf8');
const finance=readFileSync('apps/web/src/pages/api/admin/finance/pharmacy-payments.ts','utf8');
const cfm=readFileSync('apps/web/src/pages/api/admin/doctors/cfm-review.ts','utf8');
const presenceMigration=readFileSync('supabase/migrations/20261117120000_doctor_online_presence.sql','utf8');
const presenceRoute=readFileSync('apps/web/src/pages/api/doctors/presence/heartbeat.ts','utf8');
const portalFrame=readFileSync('apps/web/src/components/doctors/DoctorsPortalFrame.tsx','utf8');
const androidMain=readFileSync('apps/android/app/src/main/java/com/autamedica/android/MainActivity.kt','utf8');
const governanceUi=readFileSync('apps/web/src/components/admin/OperationalGovernanceCenter.tsx','utf8');
test('four domains update independently',()=>{for(const f of ['operational_status','clinical_status','financial_status','commercial_status'])assert.match(migration,new RegExp(`CASE WHEN p_domain='${f}' THEN p_status ELSE ${f} END`))});
test('clinical outages are not checkout gates',()=>{const gate=checkout.slice(checkout.indexOf('platform_operational_domains'));assert.doesNotMatch(gate,/clinical_status/);assert.match(gate,/commercial_status/);assert.match(gate,/financial_status/)});
test('admin actions use guarded RPCs and purge is narrowly scoped',()=>{assert.match(status,/admin_set_operational_domain_status/);assert.match(overview,/withAuthRole/);assert.match(migration,/admin_purge_orphan_dispatch_requests/);assert.match(migration,/assigned_doctor_id IS NULL/);assert.match(migration,/call_id IS NULL/)});
test('CFM review and payment override require evidence and audit',()=>{assert.match(cfm,/admin_review_cfm_license/);assert.match(finance,/evidence_reference/);assert.match(migration,/manual_override_reason_and_evidence_required/);assert.match(migration,/approved_by/)});
test('governance overview only reads consent records',()=>{assert.match(overview,/informed_consents/);assert.doesNotMatch(overview,/\.update\(|\.insert\(|\.upsert\(/)});
test('doctor heartbeat dashboard reads canonical duty status before legacy sessions',()=>{assert.match(overview,/doctor_duty_status/);assert.match(overview,/duty\?\.last_heartbeat_at\?\?session\?\.last_heartbeat_at/);assert.match(overview,/duty\?\.is_on_duty===true/)});

test('doctor online presence is authenticated, independent of duty, and expires by TTL',()=>{
  assert.match(presenceMigration,/CREATE TABLE IF NOT EXISTS public\.doctor_presence/);
  assert.match(presenceMigration,/admin_get_online_doctors_by_country/);
  assert.match(overview,/admin_get_online_doctors_by_country/);
  assert.match(presenceMigration,/auth\.uid\(\)/);
  assert.match(presenceMigration,/NOW\(\)|clock_timestamp\(\)/);
  assert.doesNotMatch(presenceMigration,/is_doctor_dispatch_approved/);
  assert.match(presenceMigration,/GRANT EXECUTE ON FUNCTION public\.heartbeat_my_doctor_presence\(\) TO authenticated/);
  assert.match(presenceRoute,/withAuthRole/);
  assert.match(presenceRoute,/heartbeat_my_doctor_presence/);
  assert.match(portalFrame,/api\/doctors\/presence\/heartbeat/);
  assert.match(androidMain,/repeatOnLifecycle\(Lifecycle\.State\.STARTED\)/);
  assert.match(androidMain,/sendDoctorPresenceHeartbeat\(\)/);
  assert.match(governanceUi,/Médicos online/);
  assert.match(governanceUi,/Online BR/);
  assert.match(governanceUi,/Online AR/);
  assert.match(governanceUi,/Heartbeat guardia/);
});


const productionDeploy = readFileSync('.github/workflows/deploy-production.yml', 'utf8');

test('production Pages deploy does not rewrite governed Memed secrets or mutate the workspace with Wrangler installation', () => {
  assert.doesNotMatch(productionDeploy, /name: Configure Memed credentials for the doctor portal/);
  assert.doesNotMatch(productionDeploy, /name: Configure Memed Mobile Pages secrets/);
  assert.doesNotMatch(productionDeploy, /cloudflare\/wrangler-action/);
  assert.match(productionDeploy, /pnpm dlx wrangler@4\.162\.0 pages deploy dist --project-name=autamedica-web/);
  assert.match(productionDeploy, /name: Configure Memed Mobile Edge secrets[\s\S]*?needs: \[validate, deploy-db\][\s\S]*?needs\.deploy-db\.result == 'success'/);
  const subdomains = productionDeploy.indexOf('name: Deploy (subdomains)');
  const postDeployCheck = productionDeploy.indexOf('name: Verify clean Git tree after Pages uploads');
  const sentry = productionDeploy.indexOf('name: Create Sentry Release');
  assert.ok(subdomains >= 0 && postDeployCheck > subdomains && sentry > postDeployCheck);
  assert.match(productionDeploy.slice(postDeployCheck, sentry), /git status --porcelain/);
});

#!/usr/bin/env node

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
const edgeFunctionPath = path.join(
  repoRoot,
  'supabase',
  'functions',
  'ingest-patient-observation',
  'index.ts',
);
const denoConfigPath = path.join(repoRoot, 'supabase', 'functions', 'deno.json');
const quickActionsHookPath = path.join(
  repoRoot,
  'apps',
  'patients',
  'src',
  'hooks',
  'useQuickActions.ts',
);

const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();

const migrationSql = migrationFiles
  .map((name) => readFileSync(path.join(migrationsDir, name), 'utf8'))
  .join('\n\n');

const checks = [
  {
    id: 'table.vital_signs',
    test: /create\s+table\s+if\s+not\s+exists\s+public\.vital_signs\s*\(/i,
    source: migrationSql,
  },
  {
    id: 'table.medication_logs',
    test: /create\s+table\s+if\s+not\s+exists\s+public\.medication_logs\s*\(/i,
    source: migrationSql,
  },
  {
    id: 'table.symptom_reports',
    test: /create\s+table\s+if\s+not\s+exists\s+public\.symptom_reports\s*\(/i,
    source: migrationSql,
  },
  {
    id: 'table.lab_results',
    test: /create\s+table\s+if\s+not\s+exists\s+public\.lab_results\s*\(/i,
    source: migrationSql,
  },
  {
    id: 'table.patient_alerts',
    test: /create\s+table\s+if\s+not\s+exists\s+public\.patient_alerts\s*\(/i,
    source: migrationSql,
  },
  {
    id: 'rls.vital_signs',
    test: /alter\s+table\s+public\.vital_signs\s+enable\s+row\s+level\s+security/i,
    source: migrationSql,
  },
  {
    id: 'rls.medication_logs',
    test: /alter\s+table\s+public\.medication_logs\s+enable\s+row\s+level\s+security/i,
    source: migrationSql,
  },
  {
    id: 'rls.symptom_reports',
    test: /alter\s+table\s+public\.symptom_reports\s+enable\s+row\s+level\s+security/i,
    source: migrationSql,
  },
  {
    id: 'rls.lab_results',
    test: /alter\s+table\s+public\.lab_results\s+enable\s+row\s+level\s+security/i,
    source: migrationSql,
  },
  {
    id: 'rls.patient_alerts',
    test: /alter\s+table\s+public\.patient_alerts\s+enable\s+row\s+level\s+security/i,
    source: migrationSql,
  },
  {
    id: 'grant.vital_signs_authenticated',
    test: /grant\s+select,\s*insert,\s*update\s+on\s+table\s+public\.vital_signs\s+to\s+authenticated/i,
    source: migrationSql,
  },
  {
    id: 'grant.medication_logs_authenticated',
    test: /grant\s+select,\s*insert,\s*update\s+on\s+table\s+public\.medication_logs\s+to\s+authenticated/i,
    source: migrationSql,
  },
  {
    id: 'grant.symptom_reports_authenticated',
    test: /grant\s+select,\s*insert,\s*update\s+on\s+table\s+public\.symptom_reports\s+to\s+authenticated/i,
    source: migrationSql,
  },
  {
    id: 'grant.lab_results_authenticated',
    test: /grant\s+select,\s*insert,\s*update\s+on\s+table\s+public\.lab_results\s+to\s+authenticated/i,
    source: migrationSql,
  },
  {
    id: 'grant.patient_alerts_authenticated',
    test: /grant\s+select,\s*update\s+on\s+table\s+public\.patient_alerts\s+to\s+authenticated/i,
    source: migrationSql,
  },
  {
    id: 'function.current_patient_id',
    test: /create\s+or\s+replace\s+function\s+public\.current_patient_id\s*\(/i,
    source: migrationSql,
  },
  {
    id: 'function.create_patient_alert',
    test: /create\s+or\s+replace\s+function\s+public\.create_patient_alert\s*\(/i,
    source: migrationSql,
  },
  {
    id: 'policy.vital_signs_patient_insert',
    test: /create\s+policy\s+"vital_signs_patient_insert"/i,
    source: migrationSql,
  },
  {
    id: 'policy.symptom_reports_patient_insert',
    test: /create\s+policy\s+"symptom_reports_patient_insert"/i,
    source: migrationSql,
  },
  {
    id: 'policy.lab_results_patient_insert',
    test: /create\s+policy\s+"lab_results_patient_insert"/i,
    source: migrationSql,
  },
];

const quickActionsHook = existsSync(quickActionsHookPath)
  ? readFileSync(quickActionsHookPath, 'utf8')
  : '';

checks.push(
  {
    id: 'hook.resolveAuthenticatedPatientContext',
    test: /resolveAuthenticatedPatientContext\(/,
    source: quickActionsHook,
  },
  {
    id: 'hook.vital_signs_patient_id_mapping',
    test: /from\('vital_signs'\)[\s\S]*patient_id:\s*patientId/,
    source: quickActionsHook,
  },
  {
    id: 'hook.medication_logs_patient_id_mapping',
    test: /from\('medication_logs'\)[\s\S]*patient_id:\s*patientId/,
    source: quickActionsHook,
  },
  {
    id: 'hook.symptom_reports_patient_id_mapping',
    test: /from\('symptom_reports'\)[\s\S]*patient_id:\s*patientId/,
    source: quickActionsHook,
  },
  {
    id: 'hook.lab_results_patient_id_mapping',
    test: /from\('lab_results'\)[\s\S]*patient_id:\s*patientId/,
    source: quickActionsHook,
  },
);

const results = checks.map((check) => ({ id: check.id, ok: check.test.test(check.source) }));

console.log('Clinical observability coherence checks');
console.log('======================================');
for (const result of results) {
  const status = result.ok ? 'OK' : 'FAIL';
  console.log(`[${status}] ${result.id}`);
}

const edgeFunctionExists = existsSync(edgeFunctionPath);
const denoConfigExists = existsSync(denoConfigPath);
console.log(`[${edgeFunctionExists ? 'OK' : 'FAIL'}] edge.ingest_patient_observation_exists`);
console.log(`[${denoConfigExists ? 'OK' : 'FAIL'}] edge.deno_config_exists`);

const hasFailures = results.some((result) => !result.ok) || !edgeFunctionExists || !denoConfigExists;
if (hasFailures) {
  console.error('\nClinical observability checks failed.');
  process.exit(1);
}

console.log('\nAll clinical observability checks passed.');

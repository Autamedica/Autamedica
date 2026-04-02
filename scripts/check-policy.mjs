#!/usr/bin/env node
// Monorepo policy checks:
// - Deep imports a patrones tipo @autamedica/<pkg>/src/<path>
// - export * en packages
// - process.env fuera del helper compartido
// Exits 0 if clean, 1 if violations found.
import { spawnSync } from 'node:child_process';
import { findProcessEnvViolations, formatViolations } from './lib/policy-checks.mjs';

function rg(pattern, cwd = process.cwd()) {
  const res = spawnSync('rg', ['-n', pattern, 'apps', 'packages', '-S', '-g', '*.ts', '-g', '*.tsx'], { cwd, encoding: 'utf8' });
  if (res.status === 2) return { code: 0, out: '' };
  return { code: res.status, out: res.stdout.trim() };
}

function filterIgnoredLines(output, ignoredPatterns = []) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !ignoredPatterns.some((pattern) => pattern.test(line)))
    .join('\n');
}

let failed = false;

// 1) Deep imports
const deep = filterIgnoredLines(rg('@autamedica/.*/src').out, [
  /vitest\.config\.[cm]?[jt]s:/u,
  /playwright\.config\.[cm]?[jt]s:/u,
]);
if (deep) {
  console.error('❌ Deep imports no permitidos:\n' + deep);
  failed = true;
}

// 2) export * en código
const star = filterIgnoredLines(rg('export \\*').out, [
  /packages\/shared\/src\/env\/index\.ts:/u,
]);
if (star) {
  console.error('❌ Uso de export * detectado:\n' + star);
  failed = true;
}

// 3) process.env fuera de shared/env.ts
const envViolations = findProcessEnvViolations(process.cwd());
if (envViolations.length > 0) {
  console.error('❌ Uso directo de process.env fuera de shared/env:\n' + formatViolations(envViolations));
  failed = true;
}

if (failed) process.exit(1);
console.log('✅ Policy checks OK');

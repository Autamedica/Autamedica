#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function getStagedMigrations() {
  const output = execSync(
    "git diff --cached --name-only --diff-filter=ACM -- supabase/migrations",
    { encoding: 'utf8' }
  ).trim();

  if (!output) return [];
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripSqlComments(sql) {
  return sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

function lintFile(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const sql = stripSqlComments(raw);
  const problems = [];

  const rules = [
    {
      id: 'TRUNCATE_FORBIDDEN',
      regex: /\bTRUNCATE\b/i,
      message: 'TRUNCATE detectado (alto riesgo).',
    },
    {
      id: 'DROP_TABLE_NO_IF_EXISTS',
      regex: /\bDROP\s+TABLE\b(?!\s+IF\s+EXISTS)/i,
      message: 'DROP TABLE sin IF EXISTS.',
    },
    {
      id: 'DELETE_WITHOUT_WHERE',
      regex: /\bDELETE\s+FROM\b[\s\S]*?;/gi,
      message: 'DELETE FROM sin WHERE.',
      validator: (statement) => !/\bWHERE\b/i.test(statement),
    },
    {
      id: 'UPDATE_WITHOUT_WHERE',
      // Match DML UPDATE statements only: UPDATE [schema.]table SET ...
      // Excludes: FOR UPDATE, AFTER/BEFORE UPDATE triggers, TG_OP = 'UPDATE' comparisons,
      // policy "name_update" identifiers, and does not cross statement boundaries (no $$ blocks).
      regex: /^\s*UPDATE\s+(?:public\.)?\w+\s+SET\b[^;]*;/gim,
      message: 'UPDATE sin WHERE.',
      validator: (statement) => !/\bWHERE\b/i.test(statement),
    },
    {
      id: 'DISABLE_RLS',
      regex: /\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i,
      message: 'DISABLE ROW LEVEL SECURITY detectado.',
    },
  ];

  for (const rule of rules) {
    if (!rule.validator) {
      if (rule.regex.test(sql)) {
        problems.push({ id: rule.id, message: rule.message });
      }
      continue;
    }

    const matches = sql.match(rule.regex) ?? [];
    for (const stmt of matches) {
      if (rule.validator(stmt)) {
        problems.push({ id: rule.id, message: rule.message });
        break;
      }
    }
  }

  return problems;
}

try {
  const files = getStagedMigrations();
  if (files.length === 0) {
    console.log('✅ Migration lint: sin migraciones staged');
    process.exit(0);
  }

  let hasErrors = false;
  for (const file of files) {
    const problems = lintFile(file);
    if (problems.length === 0) continue;

    hasErrors = true;
    console.error(`❌ ${file}`);
    for (const p of problems) {
      console.error(`   - [${p.id}] ${p.message}`);
    }
  }

  if (hasErrors) {
    console.error('');
    console.error('Revisa la migración antes de commitear.');
    process.exit(1);
  }

  console.log(`✅ Migration lint: ${files.length} archivo(s) OK`);
} catch (error) {
  console.error('❌ Error en lint-migrations:', error.message);
  process.exit(1);
}


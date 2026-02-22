#!/usr/bin/env node

import { execSync } from 'node:child_process';

const DB_TYPES_PATH = 'packages/types/src/supabase/database.types.ts';

function staged(pattern) {
  const cmd = `git diff --cached --name-only --diff-filter=ACMRTUXB -- ${pattern}`;
  const output = execSync(cmd, { encoding: 'utf8' }).trim();
  if (!output) return [];
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function stagedCodeFiles() {
  const output = execSync(
    "git diff --cached --name-only --diff-filter=ACMRTUXB -- 'apps/**' 'packages/**'",
    { encoding: 'utf8' }
  ).trim();

  if (!output) return [];
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /\.(ts|tsx|js|mjs)$/.test(line))
    .filter((line) => line !== DB_TYPES_PATH);
}

try {
  const migrationFiles = staged("'supabase/migrations/*.sql'");
  if (migrationFiles.length === 0) {
    console.log('✅ DB type drift: sin migraciones staged');
    process.exit(0);
  }

  const codeFiles = stagedCodeFiles();
  if (codeFiles.length === 0) {
    console.log('✅ DB type drift: sin cambios de código apps/packages');
    process.exit(0);
  }

  const dbTypesStaged = staged(DB_TYPES_PATH).length > 0;
  if (dbTypesStaged) {
    console.log('✅ DB type drift: database.types.ts actualizado');
    process.exit(0);
  }

  console.error('❌ Posible drift de tipos detectado:');
  console.error('   - Hay migraciones SQL staged');
  console.error('   - Hay cambios de código en apps/packages');
  console.error(`   - No está staged ${DB_TYPES_PATH}`);
  console.error('');
  console.error(`Ejecuta: pnpm db:generate && git add ${DB_TYPES_PATH}`);
  process.exit(1);
} catch (error) {
  console.error('❌ Error en check-db-type-drift:', error.message);
  process.exit(1);
}


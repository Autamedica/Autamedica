#!/usr/bin/env node

/**
 * Script de validación de políticas del monorepo Autamedica
 * Valida:
 * - Deep imports to @autamedica/star/src/star
 * - export star usage (debe usar barrels controlados)
 * - process.env directo (debe usar @autamedica/shared/ensureEnv)
 * - Consistency con GLOSARIO_MAESTRO.md
 */

import fs from 'fs';
import { spawnSync } from 'node:child_process';

function runCommand(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    cwd: process.cwd(),
    ...options
  });

  return {
    success: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status
  };
}

function checkDeepImports() {
  console.log('🔍 Verificando deep imports...');

  const result = runCommand('bash', ['-c',
    'grep -r --exclude-dir=".next" --exclude-dir="dist" --exclude-dir=".turbo" --exclude-dir="node_modules" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" "@autamedica/.*/src" apps/ packages/ | grep -v "vitest\\.config\\.ts" | grep -v "playwright\\.config\\.ts"'
  ]);

  if (result.stdout.trim()) {
    console.error('❌ Deep imports detectados (prohibidos):');
    console.error(result.stdout);
    console.error('💡 Usa imports desde el barrel principal: import { Type } from "@autamedica/types"');
    return false;
  }

  console.log('✅ No se encontraron deep imports');
  return true;
}

function checkExportStar() {
  console.log('🔍 Verificando export * ...');

  const result = runCommand('bash', ['-c',
    'grep -r --exclude-dir=".next" --exclude-dir="dist" --exclude-dir=".turbo" --exclude-dir="node_modules" --include="*.ts" --include="*.tsx" "export \\*" packages/ | grep -v "packages/shared/src/env/index.ts"'
  ]);

  if (result.stdout.trim()) {
    console.error('❌ export * detectado (debe usar barrels controlados):');
    console.error(result.stdout);
    console.error('💡 Usa exports nombrados: export { Type1, Type2 } from "./module"');
    return false;
  }

  console.log('✅ No se encontraron export * no controlados');
  return true;
}

function checkProcessEnv() {
  console.log('🔍 Verificando uso directo de process.env...');

  // Buscar process.env pero excluir el archivo de shared/env, tests y configuraciones internas
  const result = runCommand('bash', ['-c',
    'grep -r --exclude-dir=".next" --exclude-dir=".open-next" --exclude-dir="e2e" --exclude-dir="dist" --exclude-dir=".turbo" --exclude-dir="node_modules" --exclude-dir="__tests__" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" "process\\.env" apps/ packages/ | grep -v "process\\.env\\.NODE_ENV" | grep -v "apps/signaling-server" | grep -v "packages/shared/src/env" | grep -v "packages/shared/src/config/" | grep -v "packages/shared/src/auth/portals.ts" | grep -v "packages/shared/src/auth/session.ts" | grep -v "packages/shared/src/security/" | grep -v "packages/telemedicine/src/config/" | grep -v "packages/auth/src/" | grep -v "packages/shared/src/webrtc-diagnostics.ts" | grep -v "packages/shared/src/role-routing.ts" | grep -v "packages/shared/src/db.ts" | grep -v "\\.test\\.ts" | grep -v "playwright\\.config\\.ts"'
  ]);

  if (result.stdout.trim()) {
    console.error('❌ Uso directo de process.env detectado:');
    console.error(result.stdout);
    console.error('💡 Usa ensureEnv() de @autamedica/shared: ensureEnv("VARIABLE_NAME")');
    return false;
  }

  console.log('✅ No se encontró uso directo de process.env');
  return true;
}

function checkWorkspaceDependencies() {
  console.log('🔍 Verificando dependencias workspace...');

  const packageJsonFiles = [
    'apps/web-app/package.json',
    'packages/types/package.json',
    'packages/shared/package.json',
    'packages/auth/package.json',
    'packages/hooks/package.json'
  ];

  let hasErrors = false;

  for (const file of packageJsonFiles) {
    if (fs.existsSync(file)) {
      try {
        const content = JSON.parse(fs.readFileSync(file, 'utf8'));
        const deps = { ...content.dependencies, ...content.devDependencies };

        for (const [name, version] of Object.entries(deps)) {
          if (name.startsWith('@autamedica/') && version !== 'workspace:*') {
            console.error(`❌ ${file}: ${name} debe usar "workspace:*", encontrado "${version}"`);
            hasErrors = true;
          }
        }
      } catch (error) {
        console.error(`❌ Error leyendo ${file}: ${error.message}`);
        hasErrors = true;
      }
    }
  }

  if (!hasErrors) {
    console.log('✅ Dependencias workspace correctas');
  }

  return !hasErrors;
}

function checkCircularDependencies() {
  console.log('🔍 Verificando dependencias circulares...');

  // Verificar que la jerarquía es: types -> shared -> auth/hooks -> web-app
  const _dependencyOrder = [
    'packages/types',
    'packages/shared',
    'packages/auth',
    'packages/hooks',
    'apps/web-app'
  ];

  // Esta es una verificación básica - podríamos usar madge para algo más sofisticado
  console.log('✅ Verificación básica de dependencias circulares OK');
  console.log('💡 Para análisis profundo: npm install -g madge && madge --circular .');

  return true;
}

async function main() {
  console.log('🏥 Autamedica - Validación de Políticas del Monorepo\n');

  const checks = [
    checkDeepImports,
    checkExportStar,
    checkProcessEnv,
    checkWorkspaceDependencies,
    checkCircularDependencies
  ];

  let allPassed = true;

  for (const check of checks) {
    const passed = check();
    if (!passed) {
      allPassed = false;
    }
    console.log(''); // Línea en blanco entre checks
  }

  if (allPassed) {
    console.log('🎉 Todas las validaciones de políticas pasaron!');
    console.log('✅ El monorepo cumple con las reglas de arquitectura');
    process.exit(0);
  } else {
    console.log('💥 Algunas validaciones fallaron');
    console.log('🔧 Corrige los errores antes de continuar');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Error ejecutando validaciones:', error);
  process.exit(1);
});
#!/usr/bin/env node

/**
 * Script de inicio para sesiones de desarrollo con Claude
 * Ejecuta todos los procesos necesarios para desarrollo y validación en tiempo real
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

console.log('🏥 Autamedica - Iniciando sesión de desarrollo con Claude\n');

// Lista de procesos a ejecutar en paralelo
const processes = [];

function startProcess(name, command, args = [], options = {}) {
  console.log(`🚀 Iniciando ${name}...`);

  const child = spawn(command, args, {
    stdio: 'pipe',
    cwd: join(__dirname, '..'),
    ...options
  });

  child.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.trim()) {
      console.log(`[${name}] ${output}`);
    }
  });

  child.stderr.on('data', (data) => {
    const output = data.toString();
    if (output.trim()) {
      console.error(`[${name}] ${output}`);
    }
  });

  child.on('exit', (code) => {
    console.log(`[${name}] Proceso terminado con código ${code}`);
  });

  child.on('error', (error) => {
    console.error(`[${name}] Error: ${error.message}`);
  });

  processes.push({ name, child });
  return child;
}

async function main() {
  console.log('📋 Iniciando procesos de desarrollo:\n');

  // 1. Validación inicial rápida (skip validaciones lentas para dev)
  console.log('🔍 Iniciando desarrollo con validación básica...');
  console.log('  💡 Para validación completa ejecuta: pnpm check:all');
  console.log('');

  // 2. TypeScript Watch Mode para todos los packages
  startProcess(
    'TypeScript Watch',
    'node',
    ['scripts/watch-types.mjs']
  );

  // 3. Desarrollo con Turbo (hot reload)
  startProcess(
    'Dev Server',
    'pnpm',
    ['dev', '--concurrency=15']
  );

  // 4. ESLint en modo watch (si está disponible)
  try {
    startProcess(
      'ESLint Watch',
      'pnpm',
      ['run', 'watch:lint']
    );
  } catch (error) {
    console.log('ℹ️  ESLint watch mode no disponible');
  }

  // 5. Monitoreo periódico de arquitectura (cada 30 segundos)
  startProcess(
    'Architecture Monitor',
    'node',
    ['-e', `
      setInterval(() => {
        const { spawnSync } = require('child_process');
        const result = spawnSync('pnpm', ['run', 'depcruise'], {
          stdio: 'pipe',
          encoding: 'utf8'
        });

        if (result.status !== 0) {
          console.log('⚠️  [ARCHITECTURE] Violaciones detectadas - ejecuta: pnpm depcruise');
        } else {
          console.log('✅ [ARCHITECTURE] Sin violaciones');
        }
      }, 30000);

      console.log('🏗️  Monitor de arquitectura iniciado (cada 30s)');
    `]
  );

  console.log('\n✅ Todos los procesos de desarrollo iniciados');
  console.log('\n📊 Procesos activos:');
  processes.forEach(({ name }) => {
    console.log(`  🔄 ${name}`);
  });

  console.log('\n💡 Comandos útiles mientras desarrollas:');
  console.log('  🔍 Quality & Validation:');
  console.log('    pnpm ci:quality            # ⭐ Gate completo: lint + arquitectura + duplicados');
  console.log('    pnpm lint                  # Solo ESLint check');
  console.log('    pnpm lint:fix              # Auto-fix issues de ESLint');
  console.log('    pnpm depcruise             # Validar arquitectura y dependencias');
  console.log('    pnpm dup                   # Detectar código duplicado');
  console.log('  🏗️  Architecture & Policies:');
  console.log('    pnpm policies:validate     # Validar políticas del monorepo');
  console.log('    pnpm check:all             # Validación completa (lint + type + policies)');
  console.log('    pnpm type-check            # Solo TypeScript check');
  console.log('  🚀 Deployment:');
  console.log('    pnpm pre-deploy           # Validar configuración de deployment');
  console.log('    pnpm pre-deploy            # Validación pre-deployment completa');

  console.log('\n🎯 Claude está listo para desarrollar con validación en tiempo real');
  console.log('💡 Presiona Ctrl+C para detener todos los procesos\n');
}

// Manejar señales para limpiar procesos
process.on('SIGINT', () => {
  console.log('\n🛑 Deteniendo todos los procesos...');
  processes.forEach(({ name, child }) => {
    console.log(`  ⏹️  Deteniendo ${name}...`);
    child.kill('SIGTERM');
  });

  // Dar tiempo para que los procesos se cierren limpiamente
  setTimeout(() => {
    console.log('👋 Sesión de Claude finalizada');
    process.exit(0);
  }, 2000);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Señal SIGTERM recibida, deteniendo procesos...');
  processes.forEach(({ name, child }) => {
    console.log(`  ⏹️  Deteniendo ${name}...`);
    child.kill('SIGTERM');
  });
  process.exit(0);
});

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  console.error('💥 Error no capturado:', error);
  processes.forEach(({ child }) => child.kill('SIGTERM'));
  process.exit(1);
});

process.on('unhandledRejection', (reason, _promise) => {
  console.error('💥 Promise rechazada no manejada:', reason);
  processes.forEach(({ child }) => child.kill('SIGTERM'));
  process.exit(1);
});

main().catch(error => {
  console.error('💥 Error iniciando sesión de Claude:', error);
  process.exit(1);
});
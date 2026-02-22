#!/usr/bin/env node

/**
 * Deployment Security Validation for AutaMedica (Astro-first).
 * Removes obsolete Next.js build/config assumptions.
 */

import fs from 'fs';
import path from 'path';

console.log('🚀 Deployment Security Validation\n');

const CHECKS = {
  critical: [],
  warnings: [],
  passed: [],
};

function addCheck(type, message) {
  CHECKS[type].push(message);
  const icon = type === 'passed' ? '✅' : type === 'warnings' ? '⚠️' : '❌';
  console.log(`${icon} ${message}`);
}

function checkEnvironment() {
  console.log('🌍 Validating environment...');

  const requiredEnvVars = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const missingVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missingVars.length > 0) {
    addCheck('warnings', `Missing env vars in current shell: ${missingVars.join(', ')}`);
  } else {
    addCheck('passed', 'Supabase env vars available in runtime');
  }

  if (process.env.NODE_ENV === 'production') {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    if (supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1')) {
      addCheck('critical', 'Production env is using localhost Supabase URL');
    } else {
      addCheck('passed', 'Production URLs do not point to localhost');
    }
  }
}

function checkAstroSecurityFiles() {
  console.log('🔒 Validating Astro security configuration...');

  const requiredFiles = [
    'apps/web/astro.config.mjs',
    'apps/web/src/layouts/Layout.astro',
    'apps/web/src/layouts/AuthLayout.astro',
    'apps/web/src/middleware.ts',
    'apps/web/src/pages/robots.txt.ts',
    'apps/web/src/pages/sitemap.xml.ts',
  ];

  for (const file of requiredFiles) {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      addCheck('passed', `Found ${file}`);
    } else {
      addCheck('critical', `Missing required file: ${file}`);
    }
  }

  const layoutPath = path.join(process.cwd(), 'apps/web/src/layouts/Layout.astro');
  if (fs.existsSync(layoutPath)) {
    const content = fs.readFileSync(layoutPath, 'utf8');
    if (content.includes('<SeoMeta')) {
      addCheck('passed', 'SEO metadata centralized in Astro layout');
    } else {
      addCheck('warnings', 'Layout does not reference SeoMeta component');
    }
  }

  const authLayoutPath = path.join(process.cwd(), 'apps/web/src/layouts/AuthLayout.astro');
  if (fs.existsSync(authLayoutPath)) {
    const content = fs.readFileSync(authLayoutPath, 'utf8');
    if (content.includes('noindex, nofollow, noarchive')) {
      addCheck('passed', 'Auth routes enforce noindex policy');
    } else {
      addCheck('critical', 'Auth routes missing strict noindex policy');
    }
  }

  const middlewarePath = path.join(process.cwd(), 'apps/web/src/middleware.ts');
  if (fs.existsSync(middlewarePath)) {
    const content = fs.readFileSync(middlewarePath, 'utf8');
    const hasCanonicalRedirect = content.includes("requestUrl.hostname === 'autamedica.com'")
      && content.includes("canonicalUrl.hostname = 'www.autamedica.com'");

    if (hasCanonicalRedirect) {
      addCheck('passed', 'Canonical host redirect configured in middleware');
    } else {
      addCheck('warnings', 'Canonical host redirect not found in middleware');
    }
  }
}

function checkBuildArtifacts() {
  console.log('🏗️ Validating build artifacts...');

  const astroBuildPath = path.join(process.cwd(), 'apps/web/dist');
  const nextLegacyPath = path.join(process.cwd(), 'apps/web/.next');

  if (fs.existsSync(astroBuildPath)) {
    addCheck('passed', 'Astro build output directory exists (apps/web/dist)');
  } else {
    addCheck('warnings', 'Astro build output not found (run pnpm -C apps/web build)');
  }

  if (fs.existsSync(nextLegacyPath)) {
    addCheck('warnings', 'Legacy Next build artifact found in apps/web/.next');
  } else {
    addCheck('passed', 'No legacy Next build artifact in apps/web');
  }
}

function checkHIPAABaseline() {
  console.log('🏥 Validating baseline compliance indicators...');

  const hasSecurityDoc = fs.existsSync(path.join(process.cwd(), 'SECURITY.md'));
  if (hasSecurityDoc) {
    addCheck('passed', 'SECURITY.md present');
  } else {
    addCheck('warnings', 'SECURITY.md missing');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (supabaseUrl.startsWith('https://') || supabaseUrl === '') {
    addCheck('passed', 'Supabase URL uses HTTPS or is not set in this shell');
  } else {
    addCheck('critical', 'Supabase URL is not HTTPS');
  }
}

function printSummaryAndExit() {
  console.log('\n📊 Deployment Security Summary:');
  console.log(`✅ Passed: ${CHECKS.passed.length}`);
  console.log(`⚠️  Warnings: ${CHECKS.warnings.length}`);
  console.log(`❌ Critical Issues: ${CHECKS.critical.length}`);

  if (CHECKS.critical.length > 0) {
    console.log('\n🚨 DEPLOYMENT BLOCKED - Critical security issues detected.');
    process.exit(1);
  }

  if (CHECKS.warnings.length > 5) {
    console.log('\n⚠️ DEPLOYMENT CAUTION - Too many warnings. Review before production deploy.');
    process.exit(1);
  }

  console.log('\n🎉 DEPLOYMENT APPROVED - No critical issues.');
  process.exit(0);
}

checkEnvironment();
checkAstroSecurityFiles();
checkBuildArtifacts();
checkHIPAABaseline();
printSummaryAndExit();

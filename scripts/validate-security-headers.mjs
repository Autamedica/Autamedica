#!/usr/bin/env node

/**
 * Security validation aligned to Astro web app.
 * Replaces obsolete Next.js-specific checks for apps/web-app.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🔒 Validating security baseline for Astro web app...\n');

function readFileOrNull(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

function checkAstroSecurityFiles() {
  const issues = [];

  const files = {
    layout: path.join(process.cwd(), 'apps/web/src/layouts/Layout.astro'),
    authLayout: path.join(process.cwd(), 'apps/web/src/layouts/AuthLayout.astro'),
    middleware: path.join(process.cwd(), 'apps/web/src/middleware.ts'),
    robots: path.join(process.cwd(), 'apps/web/src/pages/robots.txt.ts'),
    sitemap: path.join(process.cwd(), 'apps/web/src/pages/sitemap.xml.ts'),
  };

  console.log('📋 Checking Astro security-related files...');

  for (const [name, filePath] of Object.entries(files)) {
    if (fs.existsSync(filePath)) {
      console.log(`  ✅ ${name}: found`);
    } else {
      console.log(`  ❌ ${name}: missing`);
      issues.push(`Missing required file: ${filePath}`);
    }
  }

  const layoutContent = readFileOrNull(files.layout);
  if (layoutContent) {
    const requiredMetaMarkers = ['<SeoMeta', 'theme-color', 'StructuredData'];
    for (const marker of requiredMetaMarkers) {
      if (layoutContent.includes(marker)) {
        console.log(`  ✅ layout contains: ${marker}`);
      } else {
        console.log(`  ❌ layout missing: ${marker}`);
        issues.push(`Layout missing marker: ${marker}`);
      }
    }
  }

  const authLayoutContent = readFileOrNull(files.authLayout);
  if (authLayoutContent) {
    if (authLayoutContent.includes('noindex, nofollow, noarchive')) {
      console.log('  ✅ auth layout enforces noindex');
    } else {
      console.log('  ❌ auth layout missing strict noindex');
      issues.push('Auth layout missing noindex, nofollow, noarchive');
    }
  }

  const middlewareContent = readFileOrNull(files.middleware);
  if (middlewareContent) {
    const requiredSecurityGuards = [
      "requestUrl.hostname === 'autamedica.com'",
      "canonicalUrl.hostname = 'www.autamedica.com'",
      'PROTECTED_ROUTES',
      'context.redirect',
    ];

    for (const marker of requiredSecurityGuards) {
      if (middlewareContent.includes(marker)) {
        console.log(`  ✅ middleware guard present: ${marker}`);
      } else {
        console.log(`  ⚠️ middleware guard not found: ${marker}`);
      }
    }
  }

  const robotsContent = readFileOrNull(files.robots);
  if (robotsContent) {
    const requiredRobotsDirectives = ['Disallow: /auth/', 'Disallow: /admin/', 'Disallow: /api/'];
    for (const marker of requiredRobotsDirectives) {
      if (robotsContent.includes(marker)) {
        console.log(`  ✅ robots directive found: ${marker}`);
      } else {
        console.log(`  ❌ robots directive missing: ${marker}`);
        issues.push(`robots.txt missing directive: ${marker}`);
      }
    }
  }

  const sitemapContent = readFileOrNull(files.sitemap);
  if (sitemapContent && sitemapContent.includes('ROUTES')) {
    console.log('  ✅ sitemap route generator found');
  } else {
    issues.push('sitemap.xml generator missing or malformed');
  }

  return issues;
}

function validateBuild() {
  console.log('\n🔨 Running Astro build check...');

  return new Promise((resolve) => {
    const buildProcess = spawn('pnpm', ['--filter', '@autamedica/web', 'build'], {
      stdio: 'pipe',
      cwd: process.cwd(),
    });

    let hasErrors = false;

    buildProcess.stderr.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Error:') || output.includes('✗')) {
        hasErrors = true;
      }
    });

    buildProcess.on('close', (code) => {
      if (code === 0 && !hasErrors) {
        console.log('✅ Astro build successful');
        resolve([]);
      } else {
        console.log('❌ Astro build failed');
        resolve(['Astro build failed during security validation']);
      }
    });

    setTimeout(() => {
      buildProcess.kill();
      console.log('⏰ Build timeout');
      resolve(['Build timed out during security validation']);
    }, 120000);
  });
}

async function main() {
  const allIssues = [];

  const fileIssues = checkAstroSecurityFiles();
  allIssues.push(...fileIssues);

  const buildIssues = await validateBuild();
  allIssues.push(...buildIssues);

  console.log('\n📊 Security Validation Summary:');

  if (allIssues.length === 0) {
    console.log('✅ All Astro security validations passed');
    process.exit(0);
  }

  console.log('❌ Security issues found:');
  for (const issue of allIssues) {
    console.log(`  • ${issue}`);
  }
  process.exit(1);
}

main().catch((error) => {
  console.error('❌ Security validation failed:', error.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Validates that all internal href links in source code point to existing Astro pages.
 * Catches dead links BEFORE they reach production.
 *
 * Usage: node scripts/validate-internal-routes.mjs
 * Exit code 0 = all routes valid, 1 = broken routes found
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const PAGES_DIR = 'apps/web/src/pages';
const SRC_DIR = 'apps/web/src';

// Dynamic route patterns (pages with [param]) — these match any value
const DYNAMIC_SEGMENTS = /\[.*?\]/;

// Collect all files recursively
function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...walk(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

// Build route table from Astro pages
function buildRouteTable() {
  const pages = walk(PAGES_DIR)
    .filter(f => f.endsWith('.astro') || f.endsWith('.ts') || f.endsWith('.tsx'))
    .filter(f => !f.includes('/api/')); // API routes are not navigable pages

  const routes = new Set();

  for (const page of pages) {
    let route = '/' + relative(PAGES_DIR, page)
      .replace(/\.astro$/, '')
      .replace(/\.tsx?$/, '')
      .replace(/\/index$/, '');

    if (route === '/') routes.add('/');
    else routes.add(route);

    // For dynamic routes, add the pattern
    if (DYNAMIC_SEGMENTS.test(route)) {
      const pattern = route.replace(/\[.*?\]/g, '__DYNAMIC__');
      routes.add(pattern);
    }
  }

  return routes;
}

// Extract internal hrefs from source files
function extractHrefs() {
  const sourceFiles = walk(SRC_DIR)
    .filter(f => f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.astro'))
    .filter(f => !f.includes('node_modules') && !f.includes('.test.'));

  const hrefs = [];
  const hrefPattern = /href=["'](\/(patients|doctors|pharmacy|companies|admin|auth)[^"']*?)["']/g;
  const locationPattern = /(?:window\.)?location\.href\s*=\s*['"](\/(patients|doctors|pharmacy|companies|admin|auth)[^'"]*?)['"]/g;

  for (const file of sourceFiles) {
    const content = readFileSync(file, 'utf-8');
    const relPath = relative('.', file);

    for (const pattern of [hrefPattern, locationPattern]) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        let href = match[1];
        // Strip query params and hash
        href = href.split('?')[0].split('#')[0];
        // Strip trailing slash
        if (href.length > 1 && href.endsWith('/')) href = href.slice(0, -1);

        hrefs.push({ href, file: relPath, line: content.substring(0, match.index).split('\n').length });
      }
    }
  }

  return hrefs;
}

// Check if a href matches any route (including dynamic segments)
function routeExists(href, routes) {
  if (routes.has(href)) return true;

  // Check against dynamic patterns
  const segments = href.split('/');
  for (const route of routes) {
    if (!route.includes('__DYNAMIC__')) continue;
    const routeSegments = route.split('/');
    if (routeSegments.length !== segments.length) continue;

    const matches = routeSegments.every((seg, i) =>
      seg === '__DYNAMIC__' || seg === segments[i]
    );
    if (matches) return true;
  }

  return false;
}

// Main
const routes = buildRouteTable();
const hrefs = extractHrefs();

const broken = [];
for (const { href, file, line } of hrefs) {
  if (!routeExists(href, routes)) {
    broken.push({ href, file, line });
  }
}

if (broken.length === 0) {
  console.log(`✅ All ${hrefs.length} internal routes validated against ${routes.size} pages.`);
  process.exit(0);
} else {
  console.error(`❌ ${broken.length} broken internal route(s) found:\n`);
  for (const { href, file, line } of broken) {
    console.error(`  ${file}:${line} → ${href}`);
  }
  console.error(`\nThese hrefs point to pages that don't exist in ${PAGES_DIR}/`);
  console.error('Fix the href or create the missing page.');
  process.exit(1);
}

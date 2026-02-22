#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const sitemapSourcePath = path.join(projectRoot, 'apps/web/src/pages/sitemap.xml.ts');
const pagesRoot = path.join(projectRoot, 'apps/web/src/pages');

if (!fs.existsSync(sitemapSourcePath)) {
  console.error('❌ Missing sitemap source: apps/web/src/pages/sitemap.xml.ts');
  process.exit(1);
}

const sitemapSource = fs.readFileSync(sitemapSourcePath, 'utf-8');
const routeMatches = [...sitemapSource.matchAll(/path:\s*'([^']+)'/g)];

if (routeMatches.length === 0) {
  console.error('❌ No sitemap routes found in apps/web/src/pages/sitemap.xml.ts');
  process.exit(1);
}

function resolvePageFile(routePath) {
  const normalizedRoute = routePath.replace(/^\/+/, '');
  const candidates = normalizedRoute.length === 0
    ? [path.join(pagesRoot, 'index.astro')]
    : [
        path.join(pagesRoot, `${normalizedRoute}.astro`),
        path.join(pagesRoot, normalizedRoute, 'index.astro'),
      ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

let hasErrors = false;

for (const [, routePath] of routeMatches) {
  const pageFile = resolvePageFile(routePath);
  if (!pageFile) {
    console.error(`❌ Route listed in sitemap has no page source: ${routePath}`);
    hasErrors = true;
    continue;
  }

  const source = fs.readFileSync(pageFile, 'utf-8');
  if (/robots\s*=\s*['"`][^'"`]*noindex/i.test(source)) {
    console.error(`❌ Route listed in sitemap is marked noindex: ${routePath} -> ${path.relative(projectRoot, pageFile)}`);
    hasErrors = true;
    continue;
  }

  console.log(`✅ Sitemap parity OK: ${routePath} -> ${path.relative(projectRoot, pageFile)}`);
}

if (hasErrors) {
  process.exit(1);
}

console.log('✅ SEO sitemap/indexation parity validation passed.');

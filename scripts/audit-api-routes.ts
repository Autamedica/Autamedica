#!/usr/bin/env bun
/**
 * audit-api-routes.ts
 *
 * Detecta dos clases de bugs en la integración frontend ↔ Astro API:
 *
 * 1. LLAMADAS ROTAS: fetch('/api/...') en hooks/components que apuntan
 *    a rutas que no existen en pages/api/
 *
 * 2. ENDPOINTS HUÉRFANOS: archivos en pages/api/ que ningún código
 *    del frontend referencia (posible dead code)
 *
 * Uso: bun scripts/audit-api-routes.ts
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const PAGES_API = join(ROOT, 'apps/web/src/pages/api');
const SCAN_DIRS = [
  join(ROOT, 'apps/web/src/hooks'),
  join(ROOT, 'apps/web/src/components'),
  join(ROOT, 'apps/web/src/pages'),
  join(ROOT, 'packages/hooks/src'),
];

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function c(color: keyof typeof COLORS, text: string) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

// ─── File collection ──────────────────────────────────────────────────────────

function collectFiles(dir: string, exts = ['.ts', '.tsx']): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules and dist
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.astro') continue;
      results.push(...collectFiles(full, exts));
    } else if (exts.some(ext => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

function collectApiFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectApiFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

// ─── URL → file path resolution ───────────────────────────────────────────────

/**
 * Converts an API URL to candidate Astro file paths.
 * `/api/patients/appointments` → [
 *   'apps/web/src/pages/api/patients/appointments.ts',
 *   'apps/web/src/pages/api/patients/appointments/index.ts',
 * ]
 * Handles dynamic segments: `/api/patients/appointments/${id}` or
 * `/api/patients/appointments/[id]` → searches for any [xxx].ts in that dir.
 */
function findDynamicMatch(dir: string, segment: string, rest: string[]): string[] {
  // The segment is dynamic — find any [xxx] entry in dir matching the rest
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.name.startsWith('[')) continue;
      const full = join(dir, entry.name);
      if (rest.length === 0) {
        // This is the last segment — look for a .ts file or index.ts
        if (entry.isFile() && entry.name.endsWith('.ts')) {
          results.push(full);
        } else if (entry.isDirectory()) {
          const idx = join(full, 'index.ts');
          if (existsSync(idx)) results.push(idx);
        }
      } else if (entry.isDirectory()) {
        // Recurse with remaining segments
        results.push(...urlToCandidatePaths('/' + rest.join('/'), full));
      }
    }
  } catch {
    // ignore
  }
  return results;
}

function urlToCandidatePaths(url: string, baseOverride?: string): string[] {
  // Normalize: strip leading slash, strip query strings
  let clean = url
    .replace(/^\//, '')
    .replace(/\?.*$/, '')
    // Template literal expressions like ${id} or ${roomId} → __DYNAMIC__
    .replace(/\$\{[^}]+\}/g, '__DYNAMIC__')
    // Already-bracketed dynamic segments [xxx] → __DYNAMIC__
    .replace(/\[[^\]]+\]/g, '__DYNAMIC__');

  // Remove the 'api/' prefix only if starting from PAGES_API root
  if (!baseOverride) {
    clean = clean.replace(/^api\//, '');
  }

  const base = baseOverride ?? PAGES_API;
  const segments = clean.split('/').filter(Boolean);

  if (segments.length === 0) {
    return [join(base, 'index.ts')];
  }

  const [first, ...rest] = segments;

  if (first === '__DYNAMIC__') {
    // Resolve dynamically: search for any [xxx] entry in base
    return findDynamicMatch(base, first, rest);
  }

  const nextBase = join(base, first);

  if (rest.length === 0) {
    // Last segment: try as file or index
    return [
      `${nextBase}.ts`,
      join(nextBase, 'index.ts'),
    ];
  }

  // Continue resolution with next segment
  return urlToCandidatePaths('/' + rest.join('/'), nextBase);
}

/**
 * Astro file path → URL it serves
 * apps/web/src/pages/api/patients/appointments/index.ts → /api/patients/appointments
 */
function fileToUrl(filePath: string): string {
  const rel = relative(join(ROOT, 'apps/web/src/pages'), filePath);
  return '/' + rel
    .replace(/\\/g, '/')
    .replace(/\/index\.ts$/, '')
    .replace(/\.ts$/, '')
    // [id] stays as-is (dynamic)
    ;
}

// ─── Fetch call extraction ─────────────────────────────────────────────────────

interface FetchCall {
  url: string;
  file: string;
  line: number;
}

const FETCH_PATTERN = /fetch\(\s*[`'"]([^`'"]+)[`'"]/g;
const FETCH_TEMPLATE = /fetch\(\s*`([^`]+)`/g;

function extractFetchCalls(files: string[]): FetchCall[] {
  const results: FetchCall[] = [];

  for (const file of files) {
    // Skip API route files themselves (they don't call fetch to other API routes)
    if (file.includes('/pages/api/')) continue;

    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    // Match both string and template literal fetch calls
    const patterns = [
      /fetch\(\s*['"]([^'"]+)['"]/g,
      /fetch\(\s*`([^`]+)`/g,
    ];

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const url = match[1];
        if (!url.startsWith('/api/')) continue;

        // Find line number
        const upTo = content.slice(0, match.index);
        const line = upTo.split('\n').length;

        results.push({ url, file, line });
      }
    }
  }

  // Deduplicate by url (keep first occurrence for reporting)
  const seen = new Map<string, FetchCall>();
  for (const call of results) {
    if (!seen.has(call.url)) {
      seen.set(call.url, call);
    }
  }
  return [...seen.values()];
}

// ─── Main audit ───────────────────────────────────────────────────────────────

const allSourceFiles = SCAN_DIRS.flatMap(dir => collectFiles(dir));
const allApiFiles = collectApiFiles(PAGES_API);
const allApiUrls = new Set(allApiFiles.map(fileToUrl));

const fetchCalls = extractFetchCalls(allSourceFiles);

// ── Part 1: Broken calls ──────────────────────────────────────────────────────
console.log('\n' + c('bold', '═══ LLAMADAS A API ══════════════════════════════════════════'));
console.log(c('dim', 'fetch() calls en hooks/components vs archivos en pages/api/\n'));

let brokenCount = 0;
const referencedApiUrls = new Set<string>();

for (const call of fetchCalls.sort((a, b) => a.url.localeCompare(b.url))) {
  const candidates = urlToCandidatePaths(call.url);
  const exists = candidates.some(p => existsSync(p));

  // Track which API files are referenced
  if (exists) {
    // Find which exact URL this maps to
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        referencedApiUrls.add(fileToUrl(candidate));
      }
    }
  }

  const relFile = relative(ROOT, call.file);
  const status = exists
    ? c('green', '✅')
    : c('red', '❌');

  const urlDisplay = exists
    ? c('green', call.url)
    : c('red', call.url);

  console.log(`  ${status} ${urlDisplay}`);
  if (!exists) {
    brokenCount++;
    console.log(`     ${c('dim', `→ ${relFile}:${call.line}`)}`);

    // Suggest correct path
    const urlParts = call.url.replace(/^\/api\//, '').split('/');
    const withPatients = `/api/patients/${urlParts.join('/')}`;
    const candidatesPatients = urlToCandidatePaths(withPatients);
    if (candidatesPatients.some(p => existsSync(p))) {
      console.log(`     ${c('yellow', `💡 Sugerencia: ${withPatients}`)}`);
    }
  }
}

if (fetchCalls.length === 0) {
  console.log(c('dim', '  (no se encontraron fetch() a /api/ en el codebase)'));
}

// ── Part 2: Orphan endpoints ──────────────────────────────────────────────────
console.log('\n' + c('bold', '═══ ENDPOINTS HUÉRFANOS ════════════════════════════════════'));
console.log(c('dim', 'Archivos en pages/api/ sin ninguna referencia en el codebase\n'));

// Also check non-fetch references (like string mentions of the URL)
const allSourceContent = allSourceFiles.map(f => {
  try { return readFileSync(f, 'utf-8'); } catch { return ''; }
}).join('\n');

let orphanCount = 0;
for (const apiFile of allApiFiles.sort()) {
  const url = fileToUrl(apiFile);
  const relFile = relative(ROOT, apiFile);

  // Check if URL is referenced as a string anywhere in the source
  // Use the path segments (not full URL) to handle template literals
  const pathSegment = url.replace(/\/api\//, '').replace(/\/\[.*?\]/g, '');
  const isReferenced = referencedApiUrls.has(url) ||
    allSourceContent.includes(`'${url}'`) ||
    allSourceContent.includes(`"${url}"`) ||
    allSourceContent.includes(`\`${url}\``) ||
    // Check partial match for dynamic routes
    (url.includes('[') && allSourceContent.includes(pathSegment.replace(/\/\[.*?\].*/, '')));

  if (!isReferenced) {
    orphanCount++;
    console.log(`  ${c('yellow', '⚠️')}  ${c('yellow', url)}`);
    console.log(`     ${c('dim', relFile)}`);
  }
}

if (orphanCount === 0) {
  console.log(c('green', '  ✅ No se encontraron endpoints huérfanos'));
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + c('bold', '═══ RESUMEN ════════════════════════════════════════════════'));
console.log(`  fetch() escaneados:     ${c('cyan', String(fetchCalls.length).padStart(3))}`);
console.log(`  Llamadas rotas (404):   ${brokenCount > 0 ? c('red', String(brokenCount).padStart(3)) : c('green', '  0')}`);
console.log(`  Endpoints huérfanos:    ${orphanCount > 0 ? c('yellow', String(orphanCount).padStart(3)) : c('green', '  0')}`);
console.log(`  Archivos API totales:   ${c('cyan', String(allApiFiles.length).padStart(3))}`);
console.log();

if (brokenCount > 0) {
  console.log(c('red', '  ❌ Hay llamadas rotas. Corregir paths en los hooks.'));
  process.exit(1);
} else {
  console.log(c('green', '  ✅ Todas las llamadas apuntan a endpoints existentes.'));
}

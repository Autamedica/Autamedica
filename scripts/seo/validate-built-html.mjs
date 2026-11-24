#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const distRoot = path.join(projectRoot, 'apps/web/dist');
if (!fs.existsSync(distRoot)) {
  console.error('❌ Missing Astro build output: apps/web/dist. Run the web build first.');
  process.exit(1);
}

function htmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(fullPath) : entry.isFile() && entry.name.endsWith('.html') ? [fullPath] : [];
  });
}

function readAttribute(tag, attribute) {
  const match = tag.match(new RegExp(`\\b${attribute}=["']([^"']+)["']`, 'i'));
  return match?.[1] ?? null;
}

const criticalRoutes = [
  { route: '/', file: 'index.html' },
  { route: '/patients', file: 'patients/index.html' },
  { route: '/doctors', file: 'doctors/index.html' },
  { route: '/companies', file: 'companies/index.html' },
  { route: '/platform', file: 'platform/index.html' },
];
const errors = [];
let schemaScripts = 0;
let pagesWithSchema = 0;

for (const critical of criticalRoutes) {
  const filePath = path.join(distRoot, critical.file);
  if (!fs.existsSync(filePath)) {
    errors.push(`Missing critical built route: ${critical.route} (${critical.file})`);
    continue;
  }
  const html = fs.readFileSync(filePath, 'utf8');
  const canonicals = [...html.matchAll(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/gi)];
  if (canonicals.length !== 1) {
    errors.push(`${critical.route}: expected exactly one canonical link; found ${canonicals.length}`);
  } else {
    const href = readAttribute(canonicals[0][0], 'href');
    const expected = `https://www.autamedica.com${critical.route === '/' ? '/' : critical.route}`;
    if (href !== expected) errors.push(`${critical.route}: canonical ${href} does not match ${expected}`);
  }

  if (!/<title>[^<]{3,}<\/title>/i.test(html)) errors.push(`${critical.route}: missing or empty title`);
  if (!/<meta\b(?=[^>]*\bname=["']description["'])(?=[^>]*\bcontent=["'][^"']{30,}["'])[^>]*>/i.test(html)) {
    errors.push(`${critical.route}: missing or too-short meta description`);
  }
  if (/<meta\b(?=[^>]*\bname=["']robots["'])(?=[^>]*\bcontent=["'][^"']*noindex)/i.test(html)) {
    errors.push(`${critical.route}: critical public route is marked noindex`);
  }

  const ogTag = [...html.matchAll(/<meta\b(?=[^>]*\bproperty=["']og:image["'])[^>]*>/gi)][0]?.[0];
  if (!ogTag) {
    errors.push(`${critical.route}: missing og:image`);
  } else {
    const ogValue = readAttribute(ogTag, 'content');
    try {
      const ogUrl = new URL(ogValue);
      if (ogUrl.protocol !== 'https:' || ogUrl.hostname !== 'www.autamedica.com') {
        errors.push(`${critical.route}: og:image must use the HTTPS canonical host (${ogValue})`);
      } else {
        const imagePath = path.join(distRoot, decodeURIComponent(ogUrl.pathname.replace(/^\/+/, '')));
        if (!fs.existsSync(imagePath)) errors.push(`${critical.route}: og:image asset is absent from build output (${ogUrl.pathname})`);
      }
    } catch {
      errors.push(`${critical.route}: invalid og:image URL (${ogValue})`);
    }
  }
}

for (const filePath of htmlFiles(distRoot)) {
  const html = fs.readFileSync(filePath, 'utf8');
  const scripts = [...html.matchAll(/<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi)];
  if (scripts.length > 0) pagesWithSchema++;
  for (const [index, match] of scripts.entries()) {
    schemaScripts++;
    try {
      const parsed = JSON.parse(match[1]);
      if (!parsed || typeof parsed !== 'object' || parsed['@context'] !== 'https://schema.org') {
        errors.push(`${path.relative(distRoot, filePath)}: JSON-LD script ${index + 1} must have schema.org @context`);
      }
    } catch (error) {
      errors.push(`${path.relative(distRoot, filePath)}: invalid JSON-LD script ${index + 1}: ${error.message}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`❌ ${error}`);
  process.exit(1);
}

console.log(`✅ Built SEO HTML passed: ${criticalRoutes.length} critical routes, ${pagesWithSchema} pages with JSON-LD, ${schemaScripts} valid JSON-LD scripts.`);

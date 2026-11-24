#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requiredAssets = [
  'apps/web/public/images/seo/og-main.png',
  'apps/web/public/images/seo/twitter-main.png',
  'apps/web/public/images/seo/og-patients.png',
  'apps/web/public/images/seo/og-doctors.png',
  'apps/web/public/images/seo/og-companies.png',
  'apps/web/public/images/seo/og-platform.png',
  'apps/web/public/og-image.png',
  'apps/web/public/twitter-image.png',
];
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const expectedWidth = 1200;
const expectedHeight = 630;
const errors = [];

for (const relativePath of requiredAssets) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`Missing social asset: ${relativePath}. Run pnpm seo:generate:assets.`);
    continue;
  }

  const buffer = fs.readFileSync(absolutePath);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(pngSignature)) {
    errors.push(`Invalid or truncated PNG: ${relativePath}`);
    continue;
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    errors.push(`Wrong dimensions for ${relativePath}: ${width}x${height}; expected ${expectedWidth}x${expectedHeight}`);
    continue;
  }

  console.log(`✅ Social asset OK: ${relativePath} (${width}x${height}, ${buffer.length} bytes)`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`❌ ${error}`);
  process.exit(1);
}

console.log(`✅ SEO social asset validation passed (${requiredAssets.length} images).`);

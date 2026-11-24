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
const requiredPwaAssets = [
  { path: 'apps/web/public/pwa-icon-192.png', width: 192, height: 192 },
  { path: 'apps/web/public/pwa-icon-512.png', width: 512, height: 512 },
];
const requiredLogoAssets = [
  'apps/web/public/logo_bioceramic.jpg',
  'apps/web/public/images/brand/logo_bioceramic.jpg',
];

const callLayoutPath = 'apps/web/src/layouts/CallLayout.astro';
const expectedWidth = 1200;
const expectedHeight = 630;
const errors = [];

const callLayoutSource = fs.readFileSync(path.join(projectRoot, callLayoutPath), 'utf8');
for (const contract of [
  ['og:image', 'content="https://www.autamedica.com/images/seo/og-main.png"'],
  ['og:image MIME', '<meta property="og:image:type" content="image/png" />'],
  ['twitter:image', 'content="https://www.autamedica.com/images/seo/og-main.png"'],
  ['JPEG favicon MIME', 'rel="icon" type="image/jpeg" href="/logo_bioceramic.jpg"'],
  ['Apple touch icon', 'rel="apple-touch-icon" href="/pwa-icon-192.png"'],
]) {
  if (!callLayoutSource.includes(contract[1])) {
    errors.push(`CallLayout metadata contract failed (${contract[0]}): expected ${contract[1]}`);
  }
}

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

for (const asset of requiredPwaAssets) {
  const absolutePath = path.join(projectRoot, asset.path);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`Missing PWA icon: ${asset.path}`);
    continue;
  }
  const buffer = fs.readFileSync(absolutePath);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(pngSignature)) {
    errors.push(`Invalid PWA icon PNG: ${asset.path}`);
    continue;
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== asset.width || height !== asset.height) {
    errors.push(`Wrong PWA icon dimensions for ${asset.path}: ${width}x${height}; expected ${asset.width}x${asset.height}`);
    continue;
  }
  console.log(`✅ PWA icon OK: ${asset.path} (${width}x${height})`);
}

for (const relativePath of requiredLogoAssets) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`Missing correctly typed JPEG logo: ${relativePath}`);
    continue;
  }
  const buffer = fs.readFileSync(absolutePath);
  if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    errors.push(`Logo path does not contain JPEG bytes: ${relativePath}`);
    continue;
  }
  console.log(`✅ JPEG logo OK: ${relativePath} (${buffer.length} bytes)`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`❌ ${error}`);
  process.exit(1);
}

console.log(`✅ SEO social asset validation passed (${requiredAssets.length} social PNGs + ${requiredPwaAssets.length} PWA PNGs + ${requiredLogoAssets.length} JPEG logos).`);

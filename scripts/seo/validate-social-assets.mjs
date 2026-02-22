#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const requiredAssets = [
  'apps/web/public/og-image.png',
  'apps/web/public/twitter-image.png',
];

let hasErrors = false;

for (const relativePath of requiredAssets) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ Missing social asset: ${relativePath}`);
    hasErrors = true;
    continue;
  }

  const stats = fs.statSync(absolutePath);
  if (stats.size === 0) {
    console.error(`❌ Empty social asset: ${relativePath}`);
    hasErrors = true;
    continue;
  }

  console.log(`✅ Social asset OK: ${relativePath} (${stats.size} bytes)`);
}

if (hasErrors) {
  process.exit(1);
}

console.log('✅ SEO social assets validation passed.');

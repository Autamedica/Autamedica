#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const seoMeta = read('apps/web/src/components/seo/SeoMeta.astro');
const globalSchema = read('apps/web/src/components/seo/StructuredData.astro');
const verticalSchema = read('apps/web/src/components/seo/VerticalStructuredData.astro');
const physicianPage = read('apps/web/src/pages/[country]/medicos/[doctorSlug].astro');
const errors = [];

function requireCondition(condition, message) {
  if (!condition) errors.push(message);
}

requireCondition(seoMeta.includes('hreflangAlternates?:'), 'SeoMeta must accept explicit hreflangAlternates.');
requireCondition(seoMeta.includes('validHreflangAlternates.map'), 'SeoMeta must emit only explicitly validated hreflang alternates.');
requireCondition(!/hreflang="(?:es|pt|x-default)"/.test(seoMeta), 'SeoMeta must not publish a false default ES/PT language cluster.');
requireCondition(seoMeta.includes("url.hostname === 'www.autamedica.com'"), 'Hreflang targets must use the canonical public host.');
requireCondition(seoMeta.includes("replace(/^\\/images\\/seo\\/(.+)\\.webp$/"), 'Legacy .webp social image paths must resolve to generated PNG files.');

requireCondition(globalSchema.includes("'@type': 'Organization'"), 'Global JSON-LD must describe the organization.');
requireCondition(globalSchema.includes("'@type': 'WebSite'"), 'Global JSON-LD must describe the website.');
requireCondition(globalSchema.includes("'@type': 'SoftwareApplication'"), 'Global JSON-LD must describe the application.');
requireCondition(globalSchema.includes('/images/seo/og-main.png'), 'Global JSON-LD must reference the generated PNG asset.');
requireCondition(!/aggregateRating|ratingValue|ratingCount/.test(globalSchema), 'Remove unsupported aggregate ratings from JSON-LD.');
requireCondition(!/offers:\s*\{[\s\S]*?price:\s*['"]0['"]/.test(globalSchema), 'Do not mark the whole application as a free offer.');

requireCondition(verticalSchema.includes("'@type': 'Organization'"), 'Vertical JSON-LD must identify the organization.');
requireCondition(verticalSchema.includes("'@type': 'Service'"), 'Vertical JSON-LD must identify the service.');
requireCondition(verticalSchema.includes("'@type': 'WebPage'"), 'Vertical JSON-LD must identify the page.');
requireCondition(verticalSchema.includes('inLanguage: locale'), 'Vertical JSON-LD language must reflect the rendered locale.');
requireCondition(!/MedicalBusiness|MedicalOrganization/.test(verticalSchema), 'Portal landing pages must not be represented as medical facilities.');
requireCondition(!/\.webp/.test(verticalSchema), 'Vertical JSON-LD must reference generated PNG assets.');

requireCondition(physicianPage.includes("'@type': 'Physician'"), 'Public doctor pages must retain their Physician schema.');
requireCondition(physicianPage.includes("robots={profile ? 'index, follow' : 'noindex, nofollow'}"), 'Unavailable physician pages must remain noindex.');

if (errors.length > 0) {
  for (const error of errors) console.error(`❌ ${error}`);
  process.exit(1);
}

console.log('✅ SEO structured-data and hreflang contract validation passed.');

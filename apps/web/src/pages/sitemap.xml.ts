import type { APIRoute } from 'astro';

const ROUTES: Array<{ path: string; priority: string; changefreq: string }> = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/patients', priority: '0.9', changefreq: 'weekly' },
  { path: '/doctors', priority: '0.9', changefreq: 'weekly' },
  { path: '/companies', priority: '0.8', changefreq: 'weekly' },
  { path: '/platform', priority: '0.7', changefreq: 'weekly' },
  { path: '/privacy', priority: '0.4', changefreq: 'yearly' },
  { path: '/terms', priority: '0.4', changefreq: 'yearly' },
];

function buildSitemapXml(base: URL): string {
  const now = new Date().toISOString();
  const baseUrl = base.toString().replace(/\/$/, '');

  const urls = ROUTES.map(({ path, priority, changefreq }) => {
    const loc = path === '/' ? `${baseUrl}/` : `${baseUrl}${path}`;
    return [
      '  <url>',
      `    <loc>${loc}</loc>`,
      `    <lastmod>${now}</lastmod>`,
      `    <changefreq>${changefreq}</changefreq>`,
      `    <priority>${priority}</priority>`,
      '  </url>',
    ].join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
  ].join('\n');
}

export const GET: APIRoute = ({ site }) => {
  const siteUrl = site ?? new URL('https://www.autamedica.com');

  return new Response(buildSitemapXml(siteUrl), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

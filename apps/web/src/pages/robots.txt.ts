import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const siteUrl = site ?? new URL('https://www.autamedica.com');
  const baseUrl = siteUrl.toString().replace(/\/$/, '');

  const lines = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /auth/',
    'Disallow: /admin/',
    'Disallow: /api/',
    '',
    `Sitemap: ${baseUrl}/sitemap.xml`,
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

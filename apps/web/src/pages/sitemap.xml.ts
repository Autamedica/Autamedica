import type { APIRoute } from 'astro';

const ROUTES: Array<{ path: string; priority: string; changefreq: string }> = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/nosotros', priority: '0.9', changefreq: 'monthly' },
  { path: '/patients', priority: '0.9', changefreq: 'weekly' },
  { path: '/doctors', priority: '0.9', changefreq: 'weekly' },
  { path: '/companies', priority: '0.8', changefreq: 'weekly' },
  { path: '/platform', priority: '0.7', changefreq: 'weekly' },

  // SEO Landing Pages
  { path: '/telemedicina-argentina', priority: '0.85', changefreq: 'weekly' },
  { path: '/consulta-medica-online', priority: '0.85', changefreq: 'weekly' },
  { path: '/videoconsulta-medica', priority: '0.90', changefreq: 'daily' },
  { path: '/guardia-medica-online', priority: '0.90', changefreq: 'daily' },
  { path: '/consulta-medica-en-farmacia', priority: '0.85', changefreq: 'weekly' },
  { path: '/especialidades', priority: '0.8', changefreq: 'weekly' },
  { path: '/medico-online', priority: '0.85', changefreq: 'weekly' },
  { path: '/turno-medico-online', priority: '0.85', changefreq: 'weekly' },
  { path: '/psicologo-online', priority: '0.8', changefreq: 'weekly' },
  { path: '/psiquiatra-online', priority: '0.85', changefreq: 'weekly' },
  { path: '/cardiologo-online', priority: '0.8', changefreq: 'weekly' },
  { path: '/dermatologo-online', priority: '0.8', changefreq: 'weekly' },
  { path: '/receta-medica-online', priority: '0.85', changefreq: 'weekly' },
  { path: '/receta-electronica', priority: '0.8', changefreq: 'weekly' },
  { path: '/dolor-de-pecho', priority: '0.85', changefreq: 'weekly' },
  { path: '/fiebre-en-adultos', priority: '0.8', changefreq: 'weekly' },
  { path: '/ansiedad-sintomas-cuando-consultar', priority: '0.8', changefreq: 'weekly' },
  // Cluster Certificados Médicos
  { path: '/certificados-medicos', priority: '0.90', changefreq: 'weekly' },
  { path: '/certificado-medico-online', priority: '0.90', changefreq: 'weekly' },
  { path: '/justificativo-medico', priority: '0.85', changefreq: 'weekly' },
  { path: '/certificado-medico-laboral', priority: '0.85', changefreq: 'weekly' },
  { path: '/certificado-medico-escolar', priority: '0.80', changefreq: 'weekly' },
  { path: '/certificado-aptitud-fisica', priority: '0.85', changefreq: 'weekly' },

  // Blog
  { path: '/blog', priority: '0.85', changefreq: 'weekly' },
  { path: '/blog/vacuna-antigripal-h3n2-2026', priority: '0.80', changefreq: 'monthly' },
  { path: '/blog/telemedicina-cardiologia', priority: '0.75', changefreq: 'monthly' },
  { path: '/blog/guia-consulta-medica-online', priority: '0.75', changefreq: 'monthly' },
  { path: '/blog/acceso-especialistas-provincias', priority: '0.75', changefreq: 'monthly' },
  { path: '/blog/telemedicina-revolucion-salud', priority: '0.75', changefreq: 'monthly' },
  { path: '/blog/5-senales-alerta-cardiaca', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog/ansiedad-cronica-herramientas', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog/dermatologia-acne-adulto', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog/historia-clinica-digital', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog/certificado-medico-digital-validez', priority: '0.8', changefreq: 'monthly' },

  // SEO FAQ Articles (People Also Ask - Google)
  { path: '/blog/que-hizo-el-protomedicato', priority: '0.75', changefreq: 'monthly' },
  { path: '/blog/que-es-r1-r2-r3-r4-en-medicina', priority: '0.75', changefreq: 'monthly' },
  { path: '/blog/que-dice-la-ley-26529', priority: '0.80', changefreq: 'monthly' },
  { path: '/blog/cuales-son-los-3-tipos-de-telemedicina', priority: '0.85', changefreq: 'monthly' },

  { path: '/privacidad', priority: '0.4', changefreq: 'yearly' },
  { path: '/terms', priority: '0.4', changefreq: 'yearly' },
];

const FALLBACK_LASTMOD = '2026-02-22T00:00:00.000Z';

function resolveLastmod(): string {
  const raw = import.meta.env.PUBLIC_SITEMAP_LASTMOD ?? FALLBACK_LASTMOD;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? FALLBACK_LASTMOD : parsed.toISOString();
}

function buildSitemapXml(base: URL): string {
  const lastmod = resolveLastmod();
  const baseUrl = base.toString().replace(/\/$/, '');

  const urls = ROUTES.map(({ path, priority, changefreq }) => {
    const loc = path === '/' ? `${baseUrl}/` : `${baseUrl}${path}`;
    return [
      '  <url>',
      `    <loc>${loc}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
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

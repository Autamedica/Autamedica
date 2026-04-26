import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import sentry from '@sentry/astro';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.autamedica.com',
  output: 'server',
  adapter: cloudflare({
    imageService: 'compile',
  }),
  integrations: [
    sentry({
    telemetry: false,
      org: process.env.SENTRY_ORG || 'autamedica',
      project: process.env.SENTRY_PROJECT || 'javascript-astro',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
    react(),
    tailwind({ applyBaseStyles: false }),
    sitemap({
      filter: (page) =>
        !page.includes('/api/') &&
        !page.includes('/admin/') &&
        !page.includes('/auth/') &&
        !page.includes('/patients/') &&
        !page.includes('/doctors/') &&
        !page.includes('/companies/'),
    }),
  ],
  vite: {
    css: { lightningcss: { errorRecovery: true } },
    resolve: {
      tsconfigPaths: true
    },
    server: {
      forwardConsole: true
    },
    ssr: {
      external: [
        'node-forge',
        '@signpdf/signpdf',
        '@signpdf/signer-p12',
        '@signpdf/placeholder-plain',
      ],
    },
    optimizeDeps: {
      include: ['gsap', 'gsap/ScrollTrigger', 'gsap/ScrollToPlugin']
    }
  }
});

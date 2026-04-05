import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
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
    resolve: {
      tsconfigPaths: true
    },
    server: {
      forwardConsole: true
    },
    optimizeDeps: {
      include: ['gsap', 'gsap/ScrollTrigger', 'gsap/ScrollToPlugin']
    }
  }
});

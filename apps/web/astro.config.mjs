import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.autamedica.com',
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    react(),
    tailwind({ applyBaseStyles: false })
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

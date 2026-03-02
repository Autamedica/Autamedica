import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';

/**
 * @autamedica/shared accesses process.env.NEXT_PUBLIC_SUPABASE_URL and
 * process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY via static property access
 * (required for Next.js compile-time inlining). Vite/Astro doesn't inject
 * NEXT_PUBLIC_* into process.env, so we bridge them via vite.define.
 *
 * Astro's PUBLIC_* vars are available via import.meta.env in .astro files,
 * but React islands importing @autamedica/shared need process.env.NEXT_PUBLIC_*.
 */

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
      alias: { '@': '/src' }
    },
    define: {
      'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || ''
      ),
      'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY || ''
      ),
    },
    optimizeDeps: {
      include: ['gsap', 'gsap/ScrollTrigger', 'gsap/ScrollToPlugin']
    }
  }
});

import { readFileSync } from 'node:fs';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';

// Bridge: @autamedica/shared usa process.env.NEXT_PUBLIC_* a nivel de módulo.
// Vite/Astro no inyecta .env en process.env para esas keys, así que las definimos via vite.define.
function readEnvFile() {
  try {
    const content = readFileSync(new URL('.env', import.meta.url), 'utf-8');
    const vars = {};
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      vars[t.slice(0, eq)] = t.slice(eq + 1);
    }
    return vars;
  } catch { return {}; }
}
const dotenv = readEnvFile();

export default defineConfig({
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
      'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(dotenv.NEXT_PUBLIC_SUPABASE_URL || dotenv.PUBLIC_SUPABASE_URL || ''),
      'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(dotenv.NEXT_PUBLIC_SUPABASE_ANON_KEY || dotenv.PUBLIC_SUPABASE_ANON_KEY || ''),
    },
    optimizeDeps: {
      include: ['gsap', 'gsap/ScrollTrigger', 'gsap/ScrollToPlugin']
    }
  }
});

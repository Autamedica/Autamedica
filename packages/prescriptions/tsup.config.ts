import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  tsconfig: './tsconfig.json',
  external: [
    '@autamedica/types',
    '@autamedica/shared',
    '@supabase/supabase-js',
    'zod'
  ],
})

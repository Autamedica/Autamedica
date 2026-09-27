import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    node: 'src/node/mtls.ts',
  },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  tsconfig: './tsconfig.json',
  external: ['@autamedica/types', '@autamedica/shared', '@supabase/supabase-js'],
})
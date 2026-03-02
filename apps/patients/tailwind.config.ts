import type { Config } from 'tailwindcss';
import autamedicaPreset from '@autamedica/tailwind-config';

const config: Config = {
  presets: [autamedicaPreset as Config],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/auth/src/**/*.{ts,tsx}',
    '../../packages/hooks/src/**/*.{ts,tsx}'
  ],
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      // Keep backward compat colors
      colors: {
        ivory: {
          DEFAULT: '#FDFCF9',
          50: '#FEFEFE',
          100: '#FDFCF9',
          200: '#FAF8F4',
          300: '#F5F2EC',
          400: '#EDE9E0',
          500: '#E3DDD0',
        },
      },
      backgroundColor: {
        'base-ivory': '#FDFCF9',
      },
    },
  },
  plugins: [],
};

export default config;

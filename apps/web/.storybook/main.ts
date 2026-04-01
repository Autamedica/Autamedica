import type { StorybookConfig } from '@storybook/react-vite';
// @ts-expect-error — vite is provided by @storybook/react-vite at runtime
import { mergeConfig } from 'vite'
import path from 'node:path';

const config: StorybookConfig = {
  stories: [
    '../src/**/*.stories.@(ts|tsx)',
  ],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal(config) {
    return mergeConfig(config, {
      css: {
        postcss: {
          plugins: [
            require('tailwindcss')({
              config: path.resolve(__dirname, '../tailwind.config.ts'),
            }),
            require('autoprefixer')(),
          ],
        },
      },
    });
  },
};

export default config;

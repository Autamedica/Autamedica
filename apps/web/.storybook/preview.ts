import type { Preview } from '@storybook/react';
import '../src/styles/globals.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#FFFFFF' },
        { name: 'surface', value: '#F8FBFF' },
        { name: 'dark', value: '#0F172A' },
      ],
    },
    viewport: {
      defaultViewport: 'responsive',
    },
    layout: 'centered',
  },
};

export default preview;

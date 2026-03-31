import type { Meta, StoryObj } from '@storybook/react';
import { SkeletonLoader } from '@autamedica/ui';

const meta: Meta<typeof SkeletonLoader> = {
  title: 'UI/SkeletonLoader',
  component: SkeletonLoader,
  argTypes: {
    variant: {
      control: 'select',
      options: ['card', 'list-item', 'stat-card', 'text-block'],
    },
    count: {
      control: { type: 'number', min: 1, max: 6 },
    },
  },
  args: {
    variant: 'card',
    count: 1,
  },
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <div style={{ width: '400px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SkeletonLoader>;

export const Card: Story = {
  args: { variant: 'card' },
};

export const MultipleCards: Story = {
  args: { variant: 'card', count: 3 },
};

export const ListItem: Story = {
  args: { variant: 'list-item' },
};

export const MultipleListItems: Story = {
  args: { variant: 'list-item', count: 4 },
};

export const StatCard: Story = {
  args: { variant: 'stat-card' },
  decorators: [
    (Story) => (
      <div style={{ width: '280px' }}>
        <Story />
      </div>
    ),
  ],
};

export const StatCardGrid: Story = {
  args: { variant: 'stat-card', count: 4 },
  decorators: [
    (Story) => (
      <div className="grid grid-cols-2 gap-4" style={{ width: '580px' }}>
        <Story />
      </div>
    ),
  ],
};

export const TextBlock: Story = {
  args: { variant: 'text-block' },
};

import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { CopyButton } from './CopyButton';

const meta = {
  title: 'Shared UI/Copy button',
  component: CopyButton,
  args: {
    code: 'const greeting = "Hello, world!";'
  },
  render: (args) => (
    <div className="border-border relative inline-block rounded-lg border">
      <pre className="p-4 pr-12 text-xs">{args.code}</pre>
      <CopyButton {...args} />
    </div>
  )
} satisfies Meta<typeof CopyButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomLabel: Story = {
  args: { label: 'Copy invite code' }
};

export const FrostLight = a11yStory(Default, 'frost', 'light');
export const FrostDark = a11yStory(Default, 'frost', 'dark');

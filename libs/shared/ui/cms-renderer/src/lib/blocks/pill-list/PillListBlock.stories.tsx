import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { PillListBlock } from './PillListBlock';

const meta = {
  title: 'cms-renderer/PillListBlock',
  component: PillListBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof PillListBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const args: Story['args'] = {
  blockType: 'pill-list',
  eyebrow: 'Open Source',
  heading: 'Built in the open',
  intro: 'Our packages are published to npm and free to use.',
  surface: 'dark',
  items: [
    {
      label: '@cdwr/nx-payload',
      url: 'https://www.npmjs.com/package/@cdwr/nx-payload'
    },
    {
      label: '@cdwr/create-nx-payload',
      url: 'https://www.npmjs.com/package/@cdwr/create-nx-payload'
    },
    {
      label: '@cdwr/nx-migrate-action',
      url: 'https://github.com/codeware-sthlm/nx-migrate-action'
    },
    { label: '@cdwr/fly-node' },
    { label: '@cdwr/core' }
  ]
};

export const DarkSurface: Story = {
  name: 'Dark surface',
  args
};

export const LightSurface: Story = {
  name: 'Light surface',
  args: { ...args, surface: 'light' }
};

export const ShadcnLight = a11yStory({ args }, 'shadcn', 'light');
export const ShadcnDark = a11yStory({ args }, 'shadcn', 'dark');
export const PayloadAdminLight = a11yStory({ args }, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory({ args }, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory({ args }, 'spotlight', 'light');
export const SpotlightDark = a11yStory({ args }, 'spotlight', 'dark');
export const CodewareLight = a11yStory({ args }, 'codeware', 'light');
export const CodewareDark = a11yStory({ args }, 'codeware', 'dark');

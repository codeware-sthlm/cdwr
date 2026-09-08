import type { Media } from '@codeware/shared/util/payload-types';
import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { CalloutBlock } from './CalloutBlock';

const meta = {
  title: 'cms-renderer/CalloutBlock',
  component: CalloutBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof CalloutBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const args: Story['args'] = {
  blockType: 'callout',
  showMark: true,
  heading: 'Ready to build something great?',
  body: 'Let us know what you are working on and we will figure out how to help.',
  link: {
    type: 'custom',
    url: '/contact',
    label: 'Get in touch',
    newTab: false
  }
};

const image = {
  id: 1,
  alt: 'Placeholder image',
  url: 'https://placehold.co/1200x800/png',
  width: 1200,
  height: 800,
  sizes: {},
  updatedAt: '2024-01-01T00:00:00.000Z',
  createdAt: '2024-01-01T00:00:00.000Z'
} as unknown as Media;

export const Default: Story = {
  globals: { theme: 'codeware' },
  args
};

/** An image turns the centred band into two columns. */
export const WithImage: Story = {
  name: 'With image',
  globals: { theme: 'codeware' },
  args: { ...args, image }
};

// A11y matrix — explicit export const declarations are required so the
// Storybook CSF parser can statically discover each story. Each export
// becomes an independent vitest test with axe running in 'error' mode.
export const ShadcnLight = a11yStory({ args }, 'shadcn', 'light');
export const ShadcnDark = a11yStory({ args }, 'shadcn', 'dark');
export const PayloadAdminLight = a11yStory({ args }, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory({ args }, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory({ args }, 'spotlight', 'light');
export const SpotlightDark = a11yStory({ args }, 'spotlight', 'dark');
export const CodewareLight = a11yStory({ args }, 'codeware', 'light');
export const CodewareDark = a11yStory({ args }, 'codeware', 'dark');
export const CodewareLightWithImage = a11yStory(
  { args: { ...args, image } },
  'codeware',
  'light'
);
export const CodewareDarkWithImage = a11yStory(
  { args: { ...args, image } },
  'codeware',
  'dark'
);

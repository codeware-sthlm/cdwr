import type { Media } from '@codeware/shared/util/payload-types';
import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { HeroBlock } from './HeroBlock';
import { heroGallery } from './HeroBlock.gallery';

const meta = {
  title: 'cms-renderer/HeroBlock',
  component: HeroBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof HeroBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

// The same instance the gallery renders, so the two cannot drift
const args: Story['args'] = heroGallery.example;

const media = {
  id: 1,
  alt: 'Placeholder image',
  url: 'https://placehold.co/1200x675/png',
  width: 1200,
  height: 675,
  sizes: {},
  updatedAt: '2024-01-01T00:00:00.000Z',
  createdAt: '2024-01-01T00:00:00.000Z'
} as unknown as Media;

/** The visual is what makes the claim above it checkable. */
export const WithVisual: Story = {
  args: { ...args, media }
};

export const Default: Story = {
  args
};

export const ShadcnLight = a11yStory({ args }, 'shadcn', 'light');
export const ShadcnDark = a11yStory({ args }, 'shadcn', 'dark');
export const PayloadAdminLight = a11yStory({ args }, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory({ args }, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory({ args }, 'spotlight', 'light');
export const SpotlightDark = a11yStory({ args }, 'spotlight', 'dark');
export const CodewareLight = a11yStory({ args }, 'codeware', 'light');
export const CodewareDark = a11yStory({ args }, 'codeware', 'dark');

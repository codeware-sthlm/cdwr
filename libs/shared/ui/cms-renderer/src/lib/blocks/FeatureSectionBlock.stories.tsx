import type { Media } from '@codeware/shared/util/payload-types';
import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { FeatureSectionBlock } from './FeatureSectionBlock';
import { featureSectionGallery } from './FeatureSectionBlock.gallery';

const meta = {
  title: 'cms-renderer/FeatureSectionBlock',
  component: FeatureSectionBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof FeatureSectionBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

// The same instance the gallery renders, so the two cannot drift
const args: Story['args'] = featureSectionGallery.example;

export const Default: Story = {
  args
};

/** Two points share the row evenly; the divider follows the count. */
export const TwoPoints: Story = {
  args: { ...args, subFeatures: args?.subFeatures?.slice(0, 2) }
};

/** Four wrap to two columns before they cramp. */
export const FourPoints: Story = {
  args: {
    ...args,
    subFeatures: [
      ...(args?.subFeatures ?? []),
      {
        title: 'Authored, not coded',
        body: 'A new theme is a row in the admin, not a pull request.'
      }
    ]
  }
};

const media = {
  id: 1,
  alt: 'Placeholder image',
  url: 'https://placehold.co/1376x768/png',
  width: 1376,
  height: 768,
  sizes: {},
  updatedAt: '2024-01-01T00:00:00.000Z',
  createdAt: '2024-01-01T00:00:00.000Z'
} as unknown as Media;

/** The visual sits between the claim and the points that back it. */
export const WithMedia: Story = {
  args: { ...args, media }
};

/** The header alone still stands as a section. */
export const HeaderOnly: Story = {
  args: { ...args, enableLink: false, subFeatures: [] }
};

export const ShadcnLight = a11yStory({ args }, 'shadcn', 'light');
export const ShadcnDark = a11yStory({ args }, 'shadcn', 'dark');
export const PayloadAdminLight = a11yStory({ args }, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory({ args }, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory({ args }, 'spotlight', 'light');
export const SpotlightDark = a11yStory({ args }, 'spotlight', 'dark');
export const CodewareLight = a11yStory({ args }, 'codeware', 'light');
export const CodewareDark = a11yStory({ args }, 'codeware', 'dark');
export const CodewareLightWithMedia = a11yStory(
  { args: { ...args, media } },
  'codeware',
  'light'
);
export const CodewareDarkWithMedia = a11yStory(
  { args: { ...args, media } },
  'codeware',
  'dark'
);

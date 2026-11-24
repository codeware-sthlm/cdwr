import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { FeatureCardsBlock } from './FeatureCardsBlock';
import { featureCardsGallery } from './FeatureCardsBlock.gallery';

const meta = {
  title: 'cms-renderer/FeatureCardsBlock',
  component: FeatureCardsBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof FeatureCardsBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

// The same instance the gallery renders, so the two cannot drift
const args: Story['args'] = featureCardsGallery.example;

export const Default: Story = {
  args
};

// Technology marks and a fixed-colour SVG logo all take the site's colour
export const LogosInBrandColour: Story = {
  name: 'Logos in the brand colour',
  args: {
    ...args,
    logoColor: 'brand',
    items: [
      {
        brand: { tech: 'payload' },
        title: 'Payload CMS',
        description: 'A technology mark, following the site’s colour.'
      },
      {
        brand: { tech: 'nextjs' },
        title: 'Next.js',
        description: 'Near-black in its own colour, in the brand colour here.'
      },
      {
        brand: {
          logo: {
            source: 'svg',
            svgCode:
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#7C3AED"/><circle cx="12" cy="12" r="4" fill="#E8D822"/></svg>'
          }
        },
        title: 'Own logo',
        description: 'An SVG with fixed fills, forced to the site’s colour.'
      }
    ]
  }
};

export const FrostLight = a11yStory({ args }, 'frost', 'light');
export const FrostDark = a11yStory({ args }, 'frost', 'dark');
export const PayloadAdminLight = a11yStory({ args }, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory({ args }, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory({ args }, 'spotlight', 'light');
export const SpotlightDark = a11yStory({ args }, 'spotlight', 'dark');
export const CodewareLight = a11yStory({ args }, 'codeware', 'light');
export const CodewareDark = a11yStory({ args }, 'codeware', 'dark');

import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { FeatureSectionBlock } from './FeatureSectionBlock';

const meta = {
  title: 'cms-renderer/FeatureSectionBlock',
  component: FeatureSectionBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof FeatureSectionBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const args: Story['args'] = {
  blockType: 'feature-section',
  eyebrow: 'Per-tenant theming',
  heading: 'Change the theme. Nothing reloads.',
  intro:
    'A tenant picks its palette, its colour scheme, and whether visitors may switch at all. Authored in the admin, not in a stylesheet.',
  enableLink: true,
  link: {
    type: 'custom',
    label: 'Explore theming',
    url: '/blocks?block=hero',
    newTab: false
  },
  subFeatures: [
    {
      title: 'Selected in settings',
      body: 'A tenant with one theme gets no switcher. Several, and the control appears on its own.'
    },
    {
      title: 'Light, dark, or fixed',
      body: 'A site can be restricted to one scheme when the brand demands it.'
    },
    {
      title: 'Resolved on the server',
      body: 'The choice arrives with the HTML, so nothing flashes the wrong colour on first paint.'
    }
  ]
};

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

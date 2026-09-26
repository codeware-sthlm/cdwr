import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Band } from '../../layout/Band';

import { PillListBlock } from './PillListBlock';
import { pillListGallery } from './PillListBlock.gallery';

const meta = {
  title: 'cms-renderer/PillListBlock',
  component: PillListBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof PillListBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

// The same instance the gallery renders, so the two cannot drift
const args: Story['args'] = pillListGallery.example;

export const Default: Story = { args };

// Near-black marks (Next.js, GitHub) take the text colour in dark mode and in
// a strong band; the own logo's black part follows it through currentColor
const withLogos: Story['args'] = {
  ...args,
  eyebrow: 'Built on',
  heading: 'Nothing exotic, and nothing hidden',
  intro: undefined,
  items: [
    { label: 'Payload CMS', icon: 'payload' },
    { label: 'Next.js', icon: 'nextjs' },
    { label: 'Supabase', icon: 'supabase' },
    { label: 'Tailwind', icon: 'tailwind' },
    { label: 'GitHub', icon: 'github', url: 'https://github.com' },
    {
      label: 'Own mark',
      logo: {
        source: 'svg',
        svgCode:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/><circle cx="12" cy="12" r="4" fill="#E8D822"/></svg>'
      }
    }
  ]
};

export const Logos: Story = { args: withLogos };

export const LogosInAStrongBand: Story = {
  name: 'Logos in a strong band',
  args: withLogos,
  render: (props) => (
    <Band band="strong" fit="contained">
      <PillListBlock {...props} />
    </Band>
  )
};

export const LogosCodewareDark = a11yStory(
  { args: withLogos },
  'codeware',
  'dark'
);

export const ShadcnLight = a11yStory({ args }, 'shadcn', 'light');
export const ShadcnDark = a11yStory({ args }, 'shadcn', 'dark');
export const PayloadAdminLight = a11yStory({ args }, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory({ args }, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory({ args }, 'spotlight', 'light');
export const SpotlightDark = a11yStory({ args }, 'spotlight', 'dark');
export const CodewareLight = a11yStory({ args }, 'codeware', 'light');
export const CodewareDark = a11yStory({ args }, 'codeware', 'dark');

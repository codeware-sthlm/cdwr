import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { ComingSoonBlock } from './ComingSoonBlock';
import { comingSoonGallery } from './ComingSoonBlock.gallery';

const meta = {
  title: 'cms-renderer/ComingSoonBlock',
  component: ComingSoonBlock,
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof ComingSoonBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

// The same instance the gallery renders, so the two cannot drift
const args: Story['args'] = comingSoonGallery.example;

const minimalArgs: Story['args'] = {
  blockType: 'coming-soon',
  heading: "We're building something new",
  showIllustration: false
};

const customArgs: Story['args'] = {
  ...args,
  illustration:
    '<svg viewBox="0 0 200 120" role="img" aria-label="A brand-coloured circle"><circle cx="100" cy="60" r="40" fill="var(--brand-500)"/></svg>'
};

export const Default: Story = {
  globals: { theme: 'codeware' },
  args
};

/** The heading alone, with no drawing. */
export const Minimal: Story = {
  globals: { theme: 'codeware' },
  args: minimalArgs
};

/** A drawing of the tenant's own replaces the built-in one. */
export const CustomIllustration: Story = {
  name: 'Custom illustration',
  globals: { theme: 'codeware' },
  args: customArgs
};

// A11y matrix — explicit export const declarations are required so the
// Storybook CSF parser can statically discover each story. Each export
// becomes an independent vitest test with axe running in 'error' mode.
export const FrostLight = a11yStory({ args }, 'frost', 'light');
export const FrostDark = a11yStory({ args }, 'frost', 'dark');
export const PayloadAdminLight = a11yStory({ args }, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory({ args }, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory({ args }, 'spotlight', 'light');
export const SpotlightDark = a11yStory({ args }, 'spotlight', 'dark');
export const CodewareLight = a11yStory({ args }, 'codeware', 'light');
export const CodewareDark = a11yStory({ args }, 'codeware', 'dark');
export const CodewareLightMinimal = a11yStory(
  { args: minimalArgs },
  'codeware',
  'light'
);
export const CodewareDarkCustom = a11yStory(
  { args: customArgs },
  'codeware',
  'dark'
);

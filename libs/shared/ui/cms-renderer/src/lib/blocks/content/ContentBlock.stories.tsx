import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

// Lives in RenderBlocks rather than its own folder: it renders nested blocks
import { ContentBlock } from '../../RenderBlocks';

import { contentGallery } from './ContentBlock.gallery';

const meta = {
  title: 'cms-renderer/ContentBlock',
  component: ContentBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof ContentBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

// The same instance the gallery renders, so the two cannot drift
const args: Story['args'] = contentGallery.example;

export const Default: Story = {
  args
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

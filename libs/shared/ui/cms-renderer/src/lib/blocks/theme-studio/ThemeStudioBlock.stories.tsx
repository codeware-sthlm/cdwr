import type { Meta, StoryObj } from '@storybook/react-vite';

import { ThemeStudioBlock } from './ThemeStudioBlock';
import { themeStudioGallery } from './ThemeStudioBlock.gallery';

const meta = {
  title: 'cms-renderer/ThemeStudioBlock',
  component: ThemeStudioBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof ThemeStudioBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

// The same instance the gallery renders, so the two cannot drift
const args: Story['args'] = themeStudioGallery.example;

export const Default: Story = {
  args
};

/** Opened on the Codeware theme, which reads back to a different recipe. */
export const FromCodeware: Story = {
  args: {
    ...args,
    startFrom: 'codeware'
  }
};

/**
 * No header and no note: the studio alone, framed. What a page gets when it
 * has already said what this is in the prose above.
 */
export const Bare: Story = {
  args: {
    blockType: 'theme-studio',
    startFrom: 'spotlight',
    note: ''
  }
};

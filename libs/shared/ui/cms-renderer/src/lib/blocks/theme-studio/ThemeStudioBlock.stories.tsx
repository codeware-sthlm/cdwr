import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { within } from 'storybook/test';

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

/** Below `lg` the studio is not loaded; the block says what it needs. */
export const Phone: Story = {
  args,
  globals: { viewport: { value: 'mobile1', isRotated: false } }
};

/** The studio loads lazily; axe must not run before it has arrived. */
const studioLoaded: Story['play'] = async ({ canvasElement }) => {
  await within(canvasElement).findByRole(
    'group',
    { name: 'Theme options' },
    { timeout: 10000 }
  );
};

/** A page has its own `main`, so the block has to add none of its own. */
const onAPage: NonNullable<Story['decorators']> = [
  (Story) => (
    <main>
      <Story />
    </main>
  )
];

const a11yBase = {
  args,
  decorators: onAPage,
  play: studioLoaded
};

export const CodewareLight = a11yStory(a11yBase, 'codeware', 'light');
export const CodewareDark = a11yStory(a11yBase, 'codeware', 'dark');

import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { SpacingBlock } from './SpacingBlock';

const meta = {
  title: 'cms-renderer/SpacingBlock',
  component: SpacingBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof SpacingBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const paragraph =
  'This text represents content above and below the spacing block.';

const wrapWithContent = (
  story: StoryObj<typeof meta>
): StoryObj<typeof meta> => ({
  ...story,
  render: (args) => (
    <div>
      <p className="text-muted-foreground text-sm">{paragraph}</p>
      <SpacingBlock {...args} />
      <p className="text-muted-foreground text-sm">{paragraph}</p>
    </div>
  )
});

export const Tight: Story = wrapWithContent({
  args: { blockType: 'spacing', size: 'tight' }
});

export const Regular: Story = wrapWithContent({
  args: { blockType: 'spacing', size: 'regular' }
});

export const Loose: Story = wrapWithContent({
  args: { blockType: 'spacing', size: 'loose' }
});

export const WithDivider: Story = {
  args: { blockType: 'spacing', size: 'regular', divider: true }
};

export const WithCustomColor: Story = {
  name: 'Custom divider color',
  args: {
    blockType: 'spacing',
    size: 'loose',
    divider: true,
    color: 'blue-400'
  }
};

export const ShadcnLight = a11yStory(
  { args: { blockType: 'spacing', size: 'regular', divider: true } },
  'shadcn',
  'light'
);
export const ShadcnDark = a11yStory(
  { args: { blockType: 'spacing', size: 'regular', divider: true } },
  'shadcn',
  'dark'
);
export const PayloadAdminLight = a11yStory(
  { args: { blockType: 'spacing', size: 'regular', divider: true } },
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(
  { args: { blockType: 'spacing', size: 'regular', divider: true } },
  'payload-admin',
  'dark'
);
export const SpotlightLight = a11yStory(
  { args: { blockType: 'spacing', size: 'regular', divider: true } },
  'spotlight',
  'light'
);
export const SpotlightDark = a11yStory(
  { args: { blockType: 'spacing', size: 'regular', divider: true } },
  'spotlight',
  'dark'
);
export const CodewareLight = a11yStory(
  { args: { blockType: 'spacing', size: 'regular', divider: true } },
  'codeware',
  'light'
);
export const CodewareDark = a11yStory(
  { args: { blockType: 'spacing', size: 'regular', divider: true } },
  'codeware',
  'dark'
);

import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { FileAreaBlock } from './FileAreaBlock';
import { fileAreaGallery } from './FileAreaBlock.gallery';

const meta = {
  title: 'cms-renderer/FileAreaBlock',
  component: FileAreaBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof FileAreaBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

// The same instance the gallery renders, so the two cannot drift
const files = fileAreaGallery.example.files ?? [];

export const Default: Story = {
  args: { blockType: 'file-area', files }
};

export const SingleFile: Story = {
  name: 'Single file',
  args: { blockType: 'file-area', files: [files[0]] }
};

export const Empty: Story = {
  args: { blockType: 'file-area', files: [] }
};

export const ShadcnLight = a11yStory(
  { args: { blockType: 'file-area', files } },
  'shadcn',
  'light'
);
export const ShadcnDark = a11yStory(
  { args: { blockType: 'file-area', files } },
  'shadcn',
  'dark'
);
export const PayloadAdminLight = a11yStory(
  { args: { blockType: 'file-area', files } },
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(
  { args: { blockType: 'file-area', files } },
  'payload-admin',
  'dark'
);
export const SpotlightLight = a11yStory(
  { args: { blockType: 'file-area', files } },
  'spotlight',
  'light'
);
export const SpotlightDark = a11yStory(
  { args: { blockType: 'file-area', files } },
  'spotlight',
  'dark'
);
export const CodewareLight = a11yStory(
  { args: { blockType: 'file-area', files } },
  'codeware',
  'light'
);
export const CodewareDark = a11yStory(
  { args: { blockType: 'file-area', files } },
  'codeware',
  'dark'
);

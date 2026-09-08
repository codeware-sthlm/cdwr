import type { Media } from '@codeware/shared/util/payload-types';
import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { FileAreaBlock } from './FileAreaBlock';

const meta = {
  title: 'cms-renderer/FileAreaBlock',
  component: FileAreaBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof FileAreaBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const makeMedia = (
  id: number,
  name: string,
  mimeType: string,
  filesize: number,
  url: string
): Media =>
  ({
    id,
    alt: name,
    filenameWithoutPrefix: name,
    filename: name,
    filesize,
    mimeType,
    url,
    updatedAt: '2024-06-01T00:00:00.000Z',
    createdAt: '2024-06-01T00:00:00.000Z'
  }) as unknown as Media;

const files: NonNullable<Story['args']>['files'] = [
  {
    id: '1',
    media: makeMedia(
      1,
      'project-brief.pdf',
      'application/pdf',
      204800,
      '/uploads/project-brief.pdf'
    )
  },
  {
    id: '2',
    media: makeMedia(
      2,
      'design-tokens.csv',
      'text/csv',
      8192,
      '/uploads/design-tokens.csv'
    )
  },
  {
    id: '3',
    media: makeMedia(
      3,
      'demo-recording.mp4',
      'video/mp4',
      10485760,
      '/uploads/demo-recording.mp4'
    )
  },
  {
    id: '4',
    media: makeMedia(
      4,
      'architecture.md',
      'text/markdown',
      4096,
      '/uploads/architecture.md'
    )
  }
];

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

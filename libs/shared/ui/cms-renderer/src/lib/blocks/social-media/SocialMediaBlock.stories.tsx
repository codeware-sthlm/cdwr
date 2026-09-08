import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { SocialMediaBlock } from './SocialMediaBlock';

const meta = {
  title: 'cms-renderer/SocialMediaBlock',
  component: SocialMediaBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof SocialMediaBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const social: NonNullable<Story['args']>['social'] = [
  { id: '1', platform: 'github', url: 'https://github.com/codeware-sthlm' },
  {
    id: '2',
    platform: 'linkedin',
    url: 'https://linkedin.com/company/codeware'
  },
  { id: '3', platform: 'x', url: 'https://x.com/codeware' },
  { id: '4', platform: 'email', email: 'hello@codeware.se' }
];

export const Horizontal: Story = {
  args: { blockType: 'social-media', direction: 'horizontal', social }
};

export const Vertical: Story = {
  args: { blockType: 'social-media', direction: 'vertical', social }
};

export const WithLabels: Story = {
  name: 'With labels (vertical)',
  args: {
    blockType: 'social-media',
    direction: 'vertical',
    social: [
      {
        id: '1',
        platform: 'github',
        url: 'https://github.com/codeware-sthlm',
        withLabel: true,
        label: 'codeware-sthlm'
      },
      {
        id: '2',
        platform: 'linkedin',
        url: 'https://linkedin.com/company/codeware',
        withLabel: true,
        label: 'Codeware'
      },
      {
        id: '3',
        platform: 'email',
        email: 'hello@codeware.se',
        withLabel: true,
        label: 'hello@codeware.se'
      },
      {
        id: '4',
        platform: 'phone',
        phone: '+46 70 000 00 00',
        withLabel: true,
        label: '+46 70 000 00 00'
      }
    ]
  }
};

export const AllPlatforms: Story = {
  name: 'All platforms',
  args: {
    blockType: 'social-media',
    direction: 'horizontal',
    social: [
      { id: '1', platform: 'discord', url: 'https://discord.gg/example' },
      { id: '2', platform: 'email', email: 'hello@codeware.se' },
      { id: '3', platform: 'facebook', url: 'https://facebook.com/example' },
      { id: '4', platform: 'github', url: 'https://github.com/codeware-sthlm' },
      { id: '5', platform: 'instagram', url: 'https://instagram.com/example' },
      {
        id: '6',
        platform: 'linkedin',
        url: 'https://linkedin.com/company/codeware'
      },
      { id: '7', platform: 'npm', url: 'https://npmjs.com/org/cdwr' },
      { id: '8', platform: 'phone', phone: '+46 70 000 00 00' },
      { id: '9', platform: 'web', url: 'https://codeware.se' },
      { id: '10', platform: 'x', url: 'https://x.com/codeware' },
      { id: '11', platform: 'youtube', url: 'https://youtube.com/@codeware' }
    ]
  }
};

export const ShadcnLight = a11yStory(
  { args: { blockType: 'social-media', direction: 'horizontal', social } },
  'shadcn',
  'light'
);
export const ShadcnDark = a11yStory(
  { args: { blockType: 'social-media', direction: 'horizontal', social } },
  'shadcn',
  'dark'
);
export const PayloadAdminLight = a11yStory(
  { args: { blockType: 'social-media', direction: 'horizontal', social } },
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(
  { args: { blockType: 'social-media', direction: 'horizontal', social } },
  'payload-admin',
  'dark'
);
export const SpotlightLight = a11yStory(
  { args: { blockType: 'social-media', direction: 'horizontal', social } },
  'spotlight',
  'light'
);
export const SpotlightDark = a11yStory(
  { args: { blockType: 'social-media', direction: 'horizontal', social } },
  'spotlight',
  'dark'
);
export const CodewareLight = a11yStory(
  { args: { blockType: 'social-media', direction: 'horizontal', social } },
  'codeware',
  'light'
);
export const CodewareDark = a11yStory(
  { args: { blockType: 'social-media', direction: 'horizontal', social } },
  'codeware',
  'dark'
);

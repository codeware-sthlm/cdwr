import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { AppAbout } from './AppAbout';

const meta = {
  title: 'cms-renderer/AppAbout',
  component: AppAbout,
  args: { locale: 'en' },
  parameters: { layout: 'padded' }
} satisfies Meta<typeof AppAbout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Production: Story = {
  args: {
    appInfo: {
      name: 'cms',
      version: '1.4.0',
      sha: 'ab12cd3',
      deployEnv: 'production',
      buildTime: '2026-07-27T05:30:00Z'
    }
  }
};

export const Preview: Story = {
  args: {
    appInfo: {
      name: 'web',
      version: '2.1.0-preview.3',
      sha: 'deadbee',
      deployEnv: 'preview',
      buildTime: '2026-07-27T05:30:00Z'
    }
  }
};

export const LocalDev: Story = {
  args: {
    appInfo: {
      name: 'web',
      version: '0.0.0',
      sha: '',
      deployEnv: 'development',
      buildTime: ''
    }
  }
};

export const FrostLight = a11yStory(
  { args: Production.args },
  'frost',
  'light'
);

export const FrostDark = a11yStory({ args: Production.args }, 'frost', 'dark');

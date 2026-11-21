import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { LanguageSwitchView } from './language-switch-view';

const meta = {
  title: 'App CMS/Auth/LanguageSwitchView',
  parameters: { layout: 'centered' },
  globals: { theme: 'payload-admin' }
} satisfies Meta;

export default meta;

export const Swedish: StoryObj = {
  render: () => (
    <LanguageSwitchView
      current="sv"
      label="Language"
      onSelect={() => undefined}
    />
  )
};

export const English: StoryObj = {
  render: () => (
    <LanguageSwitchView
      current="en"
      label="Language"
      onSelect={() => undefined}
    />
  )
};

export const PayloadAdminLight = a11yStory(Swedish, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(English, 'payload-admin', 'dark');

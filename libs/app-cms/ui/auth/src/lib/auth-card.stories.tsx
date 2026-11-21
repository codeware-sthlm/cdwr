import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { AuthCard } from './auth-card';

const meta = {
  title: 'App CMS/Auth/AuthCard',
  parameters: { layout: 'centered' },
  globals: { theme: 'payload-admin' },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    )
  ]
} satisfies Meta;

export default meta;

export const Basic: StoryObj = {
  render: () => (
    <AuthCard
      title="Create your site"
      description="Fill in the details below to get your own site."
      footer={<a href="#">Back to sign in</a>}
    >
      <p className="text-sm">Form content</p>
    </AuthCard>
  )
};

export const TitleOnly: StoryObj = {
  render: () => <AuthCard title="Signup is closed" />
};

export const PayloadAdminLight = a11yStory(Basic, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Basic, 'payload-admin', 'dark');

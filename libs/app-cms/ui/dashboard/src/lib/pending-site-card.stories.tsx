import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { PendingSiteCard } from './pending-site-card';

const meta = {
  title: 'App CMS/Dashboard/PendingSiteCard'
} satisfies Meta;

export default meta;

export const Default: StoryObj = {
  render: () => (
    <PendingSiteCard
      title="Your site is being set up"
      points={[
        {
          label: 'Right now',
          text: "We're preparing your site's own address and deployment."
        },
        {
          label: 'Next',
          text: "Your site goes live once it's ready."
        },
        {
          label: 'In the meantime',
          text: 'Go ahead and edit your pages. Your work is saved.'
        }
      ]}
    />
  )
};

export const PayloadAdminLight = a11yStory(Default, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Default, 'payload-admin', 'dark');
export const FrostLight = a11yStory(Default, 'frost', 'light');
export const FrostDark = a11yStory(Default, 'frost', 'dark');

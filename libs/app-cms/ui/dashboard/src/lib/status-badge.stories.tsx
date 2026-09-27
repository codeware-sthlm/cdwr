import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { StatusBadge } from './status-badge';

const meta = {
  title: 'App CMS/Dashboard/StatusBadge'
} satisfies Meta;

export default meta;

export const Variants: StoryObj = {
  render: () => (
    <div className="flex items-center gap-2">
      <StatusBadge label="Published" />
      <StatusBadge label="Draft" />
      <StatusBadge label="New" />
    </div>
  )
};

export const PayloadAdminLight = a11yStory(Variants, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Variants, 'payload-admin', 'dark');
export const FrostLight = a11yStory(Variants, 'frost', 'light');
export const FrostDark = a11yStory(Variants, 'frost', 'dark');

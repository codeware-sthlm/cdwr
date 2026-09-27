import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { a11yStory } from '@codeware/shared/util/storybook';
import { InboxIcon, PlusIcon } from '@heroicons/react/24/outline';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { EmptyState } from './empty-state';

const meta = {
  title: 'App CMS/Dashboard/EmptyState'
} satisfies Meta;

export default meta;

export const Default: StoryObj = {
  render: () => (
    <div className="bg-card border-border w-96 rounded-xl border">
      <EmptyState
        icon={InboxIcon}
        title="No activity yet"
        description="Content you and your team edit will show up here."
      />
    </div>
  )
};

export const WithAction: StoryObj = {
  render: () => (
    <div className="bg-card border-border w-96 rounded-xl border">
      <EmptyState
        icon={InboxIcon}
        title="No drafts to resume"
        description="Drafts you are working on will appear here."
      >
        <Button variant="outline" size="sm">
          <PlusIcon aria-hidden />
          Write a post
        </Button>
      </EmptyState>
    </div>
  )
};

export const PayloadAdminLight = a11yStory(
  WithAction,
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(WithAction, 'payload-admin', 'dark');
export const FrostLight = a11yStory(WithAction, 'frost', 'light');
export const FrostDark = a11yStory(WithAction, 'frost', 'dark');

import { a11yStory } from '@codeware/shared/util/storybook';
import {
  DocumentTextIcon,
  InboxIcon,
  PhotoIcon
} from '@heroicons/react/24/outline';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { TaskCard } from './task-card';

const meta = {
  title: 'App CMS/Dashboard/TaskCard'
} satisfies Meta;

export default meta;

export const Default: StoryObj = {
  render: () => (
    <div className="w-80">
      <TaskCard
        href="#"
        label="Write a blog post"
        description="Add a new article to the blog"
        icon={DocumentTextIcon}
      />
    </div>
  )
};

export const Grid: StoryObj = {
  render: () => (
    <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
      <TaskCard
        href="#"
        label="Write a blog post"
        description="Add a new article to the blog"
        icon={DocumentTextIcon}
      />
      <TaskCard
        href="#"
        label="Upload an image"
        description="Put photos or files in the library"
        icon={PhotoIcon}
      />
      <TaskCard
        href="#"
        label="Read new messages"
        description="218 form submissions are waiting"
        icon={InboxIcon}
      />
    </div>
  )
};

export const PayloadAdminLight = a11yStory(Grid, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Grid, 'payload-admin', 'dark');
export const FrostLight = a11yStory(Grid, 'frost', 'light');
export const FrostDark = a11yStory(Grid, 'frost', 'dark');

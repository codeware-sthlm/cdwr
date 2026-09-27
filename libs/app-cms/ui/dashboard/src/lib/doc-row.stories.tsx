import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { DocRow } from './doc-row';
import { getSlugIcon } from './slug-icons';

const meta = {
  title: 'App CMS/Dashboard/DocRow'
} satisfies Meta;

export default meta;

export const List: StoryObj = {
  render: () => (
    <div className="bg-card border-border flex w-96 flex-col rounded-xl border p-2">
      <DocRow
        href="#"
        title="Pricing"
        meta="Pages · 12 min ago"
        icon={getSlugIcon('pages')}
        badgeLabel="Published"
      />
      <DocRow
        href="#"
        title="Summer launch"
        meta="Posts · 1 h ago"
        icon={getSlugIcon('posts')}
        badgeLabel="Draft"
      />
      <DocRow
        href="#"
        title="Hero block with a very long title that should truncate"
        meta="Reusable content · yesterday"
        icon={getSlugIcon('reusable-content')}
        badgeLabel="New"
      />
      <DocRow
        href="#"
        title="About us"
        meta="Pages · Draft · 2 d ago"
        icon={getSlugIcon('pages')}
      />
    </div>
  )
};

export const PayloadAdminLight = a11yStory(List, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(List, 'payload-admin', 'dark');
export const FrostLight = a11yStory(List, 'frost', 'light');
export const FrostDark = a11yStory(List, 'frost', 'dark');

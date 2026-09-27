import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { CollectionCard } from './collection-card';
import { getSlugIcon } from './slug-icons';

const meta = {
  title: 'App CMS/Dashboard/CollectionCard'
} satisfies Meta;

export default meta;

export const Default: StoryObj = {
  render: () => (
    <div className="w-72">
      <CollectionCard
        href="#"
        createHref="#new"
        label="Posts"
        description="Articles and news published to the blog."
        countLabel="47 items"
        newLabel="New"
        icon={getSlugIcon('posts')}
      />
    </div>
  )
};

export const WithoutDescription: StoryObj = {
  render: () => (
    <div className="w-72">
      <CollectionCard
        href="#"
        createHref="#new"
        label="Site settings"
        countLabel="Open to edit"
        newLabel="New"
        icon={getSlugIcon('site-settings')}
      />
    </div>
  )
};

/**
 * No `createHref` → no "New" button. Used when the user can't create in the
 * collection, or for global (single-doc) collections like Navigation.
 */
export const WithoutCreate: StoryObj = {
  render: () => (
    <div className="w-72">
      <CollectionCard
        href="#"
        label="Navigation"
        description="A single, editable menu — nothing new to create."
        countLabel="Open to edit"
        icon={getSlugIcon('navigation')}
      />
    </div>
  )
};

export const Grid: StoryObj = {
  render: () => (
    <div className="grid max-w-3xl grid-cols-[repeat(auto-fill,minmax(244px,1fr))] gap-4">
      <CollectionCard
        href="#"
        createHref="#new"
        label="Posts"
        description="Articles and news published to the blog."
        countLabel="47 items"
        newLabel="New"
        icon={getSlugIcon('posts')}
      />
      <CollectionCard
        href="#"
        createHref="#new"
        label="Media"
        description="Images and files used across the site."
        countLabel="134 items"
        newLabel="New"
        icon={getSlugIcon('media')}
      />
      {/* Global (single-doc) collection: no create button */}
      <CollectionCard
        href="#"
        label="Navigation"
        countLabel="Open to edit"
        icon={getSlugIcon('navigation')}
      />
    </div>
  )
};

export const PayloadAdminLight = a11yStory(Grid, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Grid, 'payload-admin', 'dark');
export const FrostLight = a11yStory(Grid, 'frost', 'light');
export const FrostDark = a11yStory(Grid, 'frost', 'dark');

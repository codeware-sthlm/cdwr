import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { GettingStartedCard } from './getting-started-card';

const meta = {
  title: 'App CMS/Dashboard/GettingStartedCard'
} satisfies Meta;

export default meta;

const baseProps = {
  title: 'Getting started',
  subtitle:
    'A few steps to get your site going. They tick off by themselves as you go.',
  dismissLabel: 'Hide this checklist',
  onDismiss: () => undefined
};

export const NothingDone: StoryObj = {
  render: () => (
    <GettingStartedCard
      {...baseProps}
      steps={[
        { href: '#posts', label: 'Write a blog post', done: false },
        { href: '#pages', label: 'Add a page', done: false },
        { href: '#media', label: 'Upload an image', done: false }
      ]}
    />
  )
};

export const PartlyDone: StoryObj = {
  render: () => (
    <GettingStartedCard
      {...baseProps}
      steps={[
        { href: '#posts', label: 'Write a blog post', done: true },
        { href: '#pages', label: 'Add a page', done: false },
        { href: '#media', label: 'Upload an image', done: true }
      ]}
    />
  )
};

export const PayloadAdminLight = a11yStory(
  PartlyDone,
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(PartlyDone, 'payload-admin', 'dark');
export const FrostLight = a11yStory(PartlyDone, 'frost', 'light');
export const FrostDark = a11yStory(PartlyDone, 'frost', 'dark');

import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  type DomainStatusItem,
  DomainStatusRow,
  byWorstFirst
} from './domain-status-row';

const meta = {
  title: 'App CMS/Domains/DomainStatusRow'
} satisfies Meta;

export default meta;

const labels = {
  active: 'Active',
  pending: 'Waiting for DNS',
  notRequested: 'No certificate yet',
  paused: 'Paused',
  hasIssues: 'has issues',
  neverChecked: 'never checked'
};

const items: Array<DomainStatusItem> = [
  {
    hostname: 'demo.codeware.se',
    app: 'cdwr-cms-demo',
    status: 'active',
    hasIssues: false,
    checkedLabel: '2 days ago',
    href: '#',
    owner: 'Demo'
  },
  {
    hostname: 'tours.example.com',
    app: 'cdwr-web-moon',
    status: 'pending',
    statusDetail: 'Awaiting configuration',
    hasIssues: false,
    checkedLabel: '5 minutes ago',
    href: '#',
    owner: 'Moon'
  },
  {
    hostname: 'shop.example.com',
    app: 'cdwr-web-titan',
    status: 'paused',
    hasIssues: false,
    checkedLabel: 'an hour ago',
    href: '#',
    owner: 'Titan'
  },
  {
    hostname: 'green-but-broken.example.com',
    app: 'cdwr-web-titan',
    status: 'active',
    hasIssues: true,
    checkedLabel: '3 hours ago',
    href: '#',
    owner: 'Titan'
  },
  {
    hostname: 'never-requested.example.com',
    app: 'cdwr-web-titan',
    status: 'not-requested',
    hasIssues: false,
    checkedLabel: null,
    href: '#',
    owner: 'Titan'
  }
];

/**
 * The sheet's ordering, which is the point of `byWorstFirst`.
 *
 * The active-with-issues row sorts above everything: it is the one that looks
 * fine on every other surface and is not.
 */
export const WorstFirst: StoryObj = {
  render: () => (
    <div className="flex w-full max-w-140 flex-col gap-0.5">
      {[...items].sort(byWorstFirst).map((item) => (
        <DomainStatusRow key={item.hostname} item={item} labels={labels} />
      ))}
    </div>
  )
};

export const PayloadAdminLight = a11yStory(
  WorstFirst,
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(WorstFirst, 'payload-admin', 'dark');
export const FrostLight = a11yStory(WorstFirst, 'frost', 'light');
export const FrostDark = a11yStory(WorstFirst, 'frost', 'dark');

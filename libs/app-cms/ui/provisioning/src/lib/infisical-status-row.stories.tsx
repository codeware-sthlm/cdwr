import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  type InfisicalStatus,
  byWorstInfisicalState,
  toInfisicalStatusItems
} from './infisical-status';
import { InfisicalStatusRow } from './infisical-status-row';

const meta = {
  title: 'App CMS/Provisioning/InfisicalStatusRow'
} satisfies Meta;

export default meta;

const labels = {
  states: {
    'key-mismatch': 'Different key',
    'missing-key': 'Key missing',
    'missing-folder': 'No app folder',
    'no-rules': 'No deploy rules',
    unreadable: 'Cannot read',
    ready: 'Ready',
    'not-provisioned': 'Not set up',
    'not-deployed': 'Not deployed'
  },
  environments: { production: 'Production', preview: 'Preview' },
  optionalKeys: (keys: string) => `Optional settings: ${keys}`
};

const status: InfisicalStatus = {
  deployment: 'demo',
  checkedAt: '2026-09-13T21:00:00.000Z',
  environments: [
    {
      environment: 'production',
      access: 'ok',
      tenants: 'wildcard',
      apps: [
        {
          app: 'cms',
          flyApp: 'cdwr-cms-demo',
          included: true,
          apiKey: 'matches',
          optionalKeys: ['RESTRICTED_FONTS']
        },
        {
          app: 'web',
          flyApp: 'cdwr-web-demo',
          included: true,
          apiKey: 'mismatch',
          optionalKeys: []
        }
      ]
    },
    { environment: 'preview', access: 'unreadable' }
  ]
};

const everyState: InfisicalStatus = {
  deployment: 'moon',
  checkedAt: '2026-09-13T21:00:00.000Z',
  environments: [
    ...status.environments,
    {
      environment: 'preview',
      access: 'ok',
      tenants: 'listed',
      apps: [
        {
          app: 'cms',
          flyApp: 'cdwr-cms-pr-<n>-moon',
          included: true,
          apiKey: 'missing',
          optionalKeys: []
        },
        {
          app: 'web',
          flyApp: 'cdwr-web-pr-<n>-moon',
          included: false,
          apiKey: 'matches',
          optionalKeys: []
        }
      ]
    },
    { environment: 'production', access: 'ok', tenants: 'listed', apps: [] },
    { environment: 'preview', access: 'ok', tenants: 'wildcard', apps: [] },
    { environment: 'production', access: 'no-rules' }
  ]
};

const Rows = ({ value }: { value: InfisicalStatus }) => (
  <div className="flex max-w-xl flex-col gap-0.5">
    {toInfisicalStatusItems(value)
      .sort(byWorstInfisicalState)
      .map((item, index) => (
        <InfisicalStatusRow key={index} item={item} labels={labels} />
      ))}
  </div>
);

/**
 * The sheet's ordering: the row the widget quotes comes first, and every
 * state appears at least once.
 */
export const WorstFirst: StoryObj = {
  render: () => <Rows value={everyState} />
};

export const PayloadAdminLight = a11yStory(
  WorstFirst,
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(WorstFirst, 'payload-admin', 'dark');
export const ShadcnLight = a11yStory(WorstFirst, 'shadcn', 'light');
export const ShadcnDark = a11yStory(WorstFirst, 'shadcn', 'dark');

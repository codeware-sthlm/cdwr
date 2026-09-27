import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { IntegrationRow } from './integration-row';

const meta = {
  title: 'App CMS/Dashboard/IntegrationRow'
} satisfies Meta;

export default meta;

/** The sheet's list, at the width a `size="lg"` SheetContent gives it */
export const Production: StoryObj = {
  render: () => (
    <div className="flex w-full max-w-2xl flex-col">
      <IntegrationRow
        label="Email"
        provider="sendgrid"
        notConfiguredLabel="Not set up"
      />
      <IntegrationRow
        label="Error tracking"
        provider="sentry"
        value="codewaresthlm"
        notConfiguredLabel="Not set up"
      />
      <IntegrationRow
        label="File storage"
        provider="s3"
        value="media-preview · https://tiuqdqnfadzjngucaatb.supabase.co/storage/v1/s3"
        notConfiguredLabel="Not set up"
      />
      <IntegrationRow
        label="Secrets"
        provider="infisical"
        value="eu · universal-auth"
        notConfiguredLabel="Not set up"
      />
    </div>
  )
};

/** Development, where a local catcher is the correct answer rather than a fault */
export const LocalCatcher: StoryObj = {
  render: () => (
    <div className="flex w-full max-w-2xl flex-col">
      <IntegrationRow
        label="Email"
        provider="smtp"
        value="localhost"
        notConfiguredLabel="Not set up"
      />
      <IntegrationRow label="Error tracking" notConfiguredLabel="Not set up" />
      <IntegrationRow label="File storage" notConfiguredLabel="Not set up" />
      <IntegrationRow
        label="Secrets"
        provider="infisical"
        value="eu · universal-auth"
        notConfiguredLabel="Not set up"
      />
    </div>
  )
};

export const PayloadAdminLight = a11yStory(
  Production,
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(Production, 'payload-admin', 'dark');
export const FrostLight = a11yStory(Production, 'frost', 'light');
export const FrostDark = a11yStory(Production, 'frost', 'dark');

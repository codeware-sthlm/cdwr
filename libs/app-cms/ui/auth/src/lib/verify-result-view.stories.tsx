import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  type VerifyResultLabels,
  VerifyResultView,
  type VerifyResultViewProps
} from './verify-result-view';

const meta = {
  title: 'App CMS/Auth/VerifyResultView',
  parameters: { layout: 'centered' },
  globals: { theme: 'payload-admin' },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    )
  ]
} satisfies Meta;

export default meta;

const labels: VerifyResultLabels = {
  confirmTitle: 'Confirm your email address',
  confirmBody: 'One click and your account is ready.',
  confirm: 'Confirm',
  verifiedTitle: 'Your address is confirmed',
  verifiedBody: 'Your account is ready. Sign in to continue.',
  invalidTitle: 'The link is not valid',
  invalidBody: 'This link has expired or was already used.',
  signIn: 'Sign in',
  newLink: 'Send a new link'
};

const props: Omit<VerifyResultViewProps, 'state'> = {
  labels,
  signInHref: '#',
  newLinkHref: '#'
};

export const Confirm: StoryObj = {
  render: () => <VerifyResultView {...props} state="confirm" />
};

export const Verified: StoryObj = {
  render: () => <VerifyResultView {...props} state="verified" />
};

export const NotValid: StoryObj = {
  render: () => <VerifyResultView {...props} state="invalid" />
};

export const PayloadAdminLightConfirm = a11yStory(
  Confirm,
  'payload-admin',
  'light'
);
export const PayloadAdminDarkConfirm = a11yStory(
  Confirm,
  'payload-admin',
  'dark'
);
export const PayloadAdminLight = a11yStory(Verified, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Verified, 'payload-admin', 'dark');
export const PayloadAdminLightNotValid = a11yStory(
  NotValid,
  'payload-admin',
  'light'
);
export const PayloadAdminDarkNotValid = a11yStory(
  NotValid,
  'payload-admin',
  'dark'
);

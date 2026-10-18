import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  type SignupFormLabels,
  SignupFormView,
  type SignupFormViewProps,
  type SignupValues
} from './signup-form-view';

const meta = {
  title: 'App CMS/Auth/SignupFormView',
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

const labels: SignupFormLabels = {
  title: 'Create your site',
  intro: 'Fill in the details below to get your own site.',
  code: 'Invite code',
  name: 'Your name',
  email: 'Email address',
  password: 'Password',
  passwordHint: 'At least 10 characters.',
  siteName: 'Site name',
  sectionInvite: 'Your invite',
  sectionYou: 'You',
  sectionSite: 'Your site',
  sectionInviteHelp: 'The code you were given decides that you may sign up.',
  sectionYouHelp:
    'Your own account; you sign in with this address and password.',
  sectionSiteHelp: 'The name your visitors see; the address follows from it.',
  inviteCodeHelp:
    'Signup is by invitation. You get an invite code from Codeware; ask the person who pointed you here, or write to us.',
  addressPreview: 'A custom domain can be connected later.',
  availabilityChecking: 'Checking…',
  availabilityAvailable: 'Available',
  availabilityTaken: 'That name is already taken. Try another.',
  submit: 'Create site',
  submitting: 'Creating site...',
  successTitle: 'Check your email to confirm your address',
  successBody: 'We sent a link to the address you gave.'
};

const empty: SignupValues = {
  code: '',
  name: '',
  email: '',
  password: '',
  siteName: ''
};

const filled: SignupValues = {
  code: 'WELCOME-2026',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'correct horse battery',
  siteName: 'Analytical Engines'
};

const props: SignupFormViewProps = {
  labels,
  values: empty,
  status: 'idle',
  humanCheck: (
    <div className="text-muted-foreground flex h-16 items-center justify-center rounded-md border border-dashed text-sm">
      Human check
    </div>
  ),
  footer: (
    <p>
      Didn&apos;t get the email? <a href="#">Send it again</a>
    </p>
  ),
  sentFooter: (
    <>
      <a href="#">Didn&apos;t get the email? Send it again</a>
      <a href="#">Back to sign in</a>
    </>
  ),
  onChange: () => undefined,
  onSubmit: (event) => event.preventDefault()
};

export const Empty: StoryObj = {
  render: () => <SignupFormView {...props} />
};

export const Filled: StoryObj = {
  render: () => <SignupFormView {...props} values={filled} />
};

const filledProps: SignupFormViewProps = {
  ...props,
  values: filled,
  siteUrl: 'https://cdwr-cms-analytical-engines.fly.dev'
};

export const Sections: StoryObj = {
  render: () => <SignupFormView {...filledProps} />
};

export const Checking: StoryObj = {
  render: () => <SignupFormView {...filledProps} availability="checking" />
};

export const Available: StoryObj = {
  render: () => <SignupFormView {...filledProps} availability="available" />
};

export const Taken: StoryObj = {
  render: () => <SignupFormView {...filledProps} availability="taken" />
};

export const FieldErrors: StoryObj = {
  render: () => (
    <SignupFormView
      {...props}
      values={filled}
      status="refused"
      fieldErrors={{
        email: 'This address already has an account.',
        password: 'The password is too common.',
        siteName: 'That name is already taken. Try another.'
      }}
    />
  )
};

export const Submitting: StoryObj = {
  render: () => (
    <SignupFormView {...props} values={filled} status="submitting" />
  )
};

export const Sent: StoryObj = {
  render: () => <SignupFormView {...props} values={filled} status="sent" />
};

export const Refused: StoryObj = {
  render: () => (
    <SignupFormView
      {...props}
      values={filled}
      status="refused"
      refusal="This invite code can't be used."
    />
  )
};

export const PayloadAdminLight = a11yStory(Filled, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Filled, 'payload-admin', 'dark');
export const PayloadAdminDarkErrors = a11yStory(
  FieldErrors,
  'payload-admin',
  'dark'
);

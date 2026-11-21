import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  type ResendFormLabels,
  ResendFormView,
  type ResendFormViewProps
} from './resend-form-view';

const meta = {
  title: 'App CMS/Auth/ResendFormView',
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

const labels: ResendFormLabels = {
  title: 'Send the confirmation email again',
  intro: 'Enter the email address you signed up with.',
  email: 'Email address',
  submit: 'Send again',
  submitting: 'Sending...',
  done: 'If the address has an account that is waiting for confirmation, a new email is on its way.'
};

const props: ResendFormViewProps = {
  labels,
  email: '',
  status: 'idle',
  humanCheck: (
    <div className="text-muted-foreground flex h-16 items-center justify-center rounded-md border border-dashed text-sm">
      Human check
    </div>
  ),
  footer: <a href="#">Back to sign in</a>,
  onChange: () => undefined,
  onSubmit: (event) => event.preventDefault()
};

export const Empty: StoryObj = {
  render: () => <ResendFormView {...props} />
};

export const Filled: StoryObj = {
  render: () => <ResendFormView {...props} email="ada@example.com" />
};

export const Submitting: StoryObj = {
  render: () => (
    <ResendFormView {...props} email="ada@example.com" status="submitting" />
  )
};

export const Sent: StoryObj = {
  render: () => (
    <ResendFormView {...props} email="ada@example.com" status="sent" />
  )
};

export const Refused: StoryObj = {
  render: () => (
    <ResendFormView
      {...props}
      email="ada@example.com"
      status="refused"
      refusal="Too many attempts. Try again later."
    />
  )
};

export const PayloadAdminLight = a11yStory(Filled, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Filled, 'payload-admin', 'dark');
export const PayloadAdminDarkRefused = a11yStory(
  Refused,
  'payload-admin',
  'dark'
);

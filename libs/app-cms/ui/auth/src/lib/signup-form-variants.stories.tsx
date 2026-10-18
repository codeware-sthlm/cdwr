import { cn } from '@codeware/shared/util/ui';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

import {
  type SignupFormLabels,
  type SignupFormViewProps,
  type SignupValues
} from './signup-form-view';
import {
  SignupFormVariantA,
  SignupFormVariantB
} from './signup-form-view.variants';

const meta = {
  title: 'App CMS/Auth/SignupFormVariants',
  parameters: { layout: 'fullscreen' },
  globals: { theme: 'payload-admin' }
} satisfies Meta;

export default meta;

const labels: SignupFormLabels = {
  title: 'Create your site',
  intro:
    'Fill in the details below to get your own site. It takes a minute, and we confirm your email address before anything is set up.',
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
    <>
      <p>
        Didn&apos;t get the email? <a href="#">Send it again</a>
      </p>
      <a href="#">Back to sign in</a>
    </>
  ),
  onChange: () => undefined,
  onSubmit: (event) => event.preventDefault()
};

const filledProps: SignupFormViewProps = {
  ...props,
  values: filled,
  siteUrl: 'https://cdwr-cms-analytical-engines.fly.dev',
  availability: 'available'
};

const errorProps: SignupFormViewProps = {
  ...props,
  values: filled,
  status: 'refused',
  siteUrl: 'https://cdwr-cms-analytical-engines.fly.dev',
  availability: 'taken',
  fieldErrors: {
    email: 'This address already has an account.',
    password: 'The password is too common.',
    siteName: 'That name is already taken. Try another.'
  }
};

/** The page as it would be laid out: centred at the card's width on the page background */
const Page = ({
  variant,
  children
}: {
  variant: 'A' | 'B';
  children: ReactNode;
}) => (
  <div className="bg-background text-foreground flex min-h-screen justify-center p-6 sm:p-8">
    <div className={cn('w-full', variant === 'A' ? 'max-w-3xl' : 'max-w-2xl')}>
      {children}
    </div>
  </div>
);

const a = (p: SignupFormViewProps): StoryObj => ({
  render: () => (
    <Page variant="A">
      <SignupFormVariantA {...p} />
    </Page>
  )
});

const b = (p: SignupFormViewProps): StoryObj => ({
  render: () => (
    <Page variant="B">
      <SignupFormVariantB {...p} />
    </Page>
  )
});

export const AFilled = a(filledProps);
export const AErrors = a(errorProps);
export const AEmpty = a(props);
export const BFilled = b(filledProps);
export const BErrors = b(errorProps);
export const BEmpty = b(props);

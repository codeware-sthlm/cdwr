import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { MemberSession } from './MemberSession';

/**
 * The sign-in slot a tenant site shows when it has members-only content.
 *
 * One slot that swaps between the two states rather than two separate
 * controls, so its position is learnable — and since navigation hides what a
 * visitor may not read, this is the only trace a member area leaves for
 * someone who is signed out.
 */
const meta = {
  title: 'cms-renderer/MemberSession',
  component: MemberSession,
  globals: { theme: 'spotlight' },
  parameters: { layout: 'centered' }
} satisfies Meta<typeof MemberSession>;

export default meta;
type Story = StoryObj<typeof meta>;

const paths = {
  loginPath: '/login',
  logoutPath: '/api/member-logout'
};

/** Signed out: a link to the sign-in page, carrying the page to return to. */
export const SignedOut: Story = {
  args: { session: { ...paths, name: null } }
};

/**
 * Signed in: the member's name and a way out.
 *
 * The name is what tells a visitor they are signed in at all — nothing else on
 * a tenant site says so.
 */
export const SignedIn: Story = {
  args: { session: { ...paths, name: 'Anna Lindqvist' } }
};

/** A long name must not push the sign-out control off the line. */
export const LongName: Story = {
  name: 'Signed in (long name)',
  args: {
    session: {
      ...paths,
      name: 'Anna-Karin Lindqvist-Söderström'
    }
  }
};

// The slot is a link in one state and a form in the other, so both are worth
// checking against a theme it was not designed in
export const ShadcnLight = a11yStory(
  { args: SignedIn.args },
  'shadcn',
  'light'
);
export const ShadcnDark = a11yStory({ args: SignedOut.args }, 'shadcn', 'dark');
export const SpotlightLight = a11yStory(
  { args: SignedIn.args },
  'spotlight',
  'light'
);
export const SpotlightDark = a11yStory(
  { args: SignedOut.args },
  'spotlight',
  'dark'
);

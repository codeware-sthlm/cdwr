import type { FooterData } from '@codeware/shared/util/payload-api';
import { a11yStory } from '@codeware/shared/util/storybook';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';

import { Container } from '../layout/Container';

import { Footer } from './Footer';

/**
 * Place the footer the way the site layout does: a centered content card on the
 * page background. Without it the footer's full-bleed surface is invisible,
 * since it only reads against the card it ends.
 *
 * Mirrors `RenderLayout`'s content section, down to painting the card from a
 * layer *behind* the flow — otherwise the footer's top margin renders in page
 * background here but in card background in the app, which makes the footer
 * look far airier in Storybook than it is. `absolute` stands in for the app's
 * `fixed`, and `-m-6` cancels the preview decorator's padding so the footer
 * reaches the canvas edges.
 */
const withPageContext: Decorator = (Story) => (
  <div className="bg-core-background-body relative -m-6 flex min-h-screen flex-col">
    <div className="absolute inset-0 flex justify-center sm:px-8">
      <div className="flex w-full max-w-7xl lg:px-8">
        <div className="bg-core-background-content ring-core-content-border w-full ring-1" />
      </div>
    </div>
    <div className="relative flex flex-1 flex-col">
      {/* Same container as page content, so you can see the footer line up */}
      <Container className="flex-1 py-8">
        <p className="text-muted-foreground text-sm">Page content</p>
      </Container>
      <Story />
    </div>
  </div>
);

const meta = {
  title: 'cms-renderer/Footer',
  component: Footer,
  decorators: [withPageContext],
  // Both sites run spotlight, and it is the only theme where the page
  // background differs from the content surface — the others map both to
  // `--background`, which hides the footer's surface entirely
  globals: { theme: 'spotlight' },
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof Footer>;

export default meta;
type Story = StoryObj<typeof meta>;

const links = [
  { key: '1', label: 'About', newTab: false, url: '/about' },
  { key: '2', label: 'Services', newTab: false, url: '/services' },
  { key: '3', label: 'Blog', newTab: false, url: '/posts' },
  { key: '4', label: 'Careers', newTab: false, url: '/careers' },
  { key: '5', label: 'Contact', newTab: false, url: '/contact' }
];

const contact = [
  { id: '1', platform: 'email' as const, email: 'hello@codeware.se' },
  {
    id: '2',
    platform: 'linkedin' as const,
    url: 'https://linkedin.com/company/codeware'
  },
  { id: '3', platform: 'phone' as const, phone: '+46 70 123 45 67' }
];

/** Everything an editor can turn on, so the variants are comparable. */
const complete: FooterData = {
  appName: 'Codeware Sthlm AB',
  contact,
  copyright: '© {year} Codeware Sthlm AB. All rights reserved.',
  legalLinks: [
    { key: 'legal-privacy', label: 'Privacy', newTab: false, url: '/privacy' },
    { key: 'legal-terms', label: 'Terms', newTab: false, url: '/terms' }
  ],
  links,
  showVersion: true,
  tagline: 'We build digital products that outlive their launch date.',
  variant: 'standard'
};

/** Links and contacts on one row, secondary line beneath. */
export const Standard: Story = {
  args: { footer: complete }
};

/** One centered stack — for sites with only a few pages. */
export const Compact: Story = {
  args: { footer: { ...complete, variant: 'compact' } }
};

/** Brand and tagline beside the links, secondary line on its own bar. */
export const Expanded: Story = {
  args: { footer: { ...complete, variant: 'expanded' } }
};

/** Too few links to fill a second column — they stay in one list. */
export const ExpandedFewLinks: Story = {
  name: 'Expanded (few links)',
  args: {
    footer: {
      ...complete,
      links: links.slice(0, 2),
      variant: 'expanded'
    }
  }
};

/** Untouched settings: navigation links and the default copyright line. */
export const Minimal: Story = {
  args: {
    footer: {
      ...complete,
      contact: [],
      showVersion: false,
      tagline: null
    }
  }
};

/** Single page site: no links, just the copyright line. */
export const CopyrightOnly: Story = {
  args: {
    footer: {
      ...complete,
      contact: [],
      links: [],
      showVersion: false,
      tagline: null,
      variant: 'compact'
    }
  }
};

/** Copyright turned off — the version line keeps its place on the right. */
export const NoCopyright: Story = {
  args: { footer: { ...complete, copyright: null, tagline: null } }
};

/**
 * A site with members-only content offers a way in. The slot only appears when
 * the tenant has gated something, so most sites never show it.
 */
export const WithSignIn: Story = {
  name: 'With sign in',
  args: {
    footer: complete,
    session: {
      name: null,
      loginPath: '/login',
      logoutPath: '/api/member-logout'
    }
  }
};

/** Signed in, the same slot carries the member's name and the way out. */
export const WithSignedInMember: Story = {
  name: 'With signed-in member',
  args: {
    footer: complete,
    session: {
      name: 'Anna Lindqvist',
      loginPath: '/login',
      logoutPath: '/api/member-logout'
    }
  }
};

/** Compact stacks the slot with everything else. */
export const CompactWithMember: Story = {
  name: 'Compact (signed-in member)',
  args: {
    footer: { ...complete, variant: 'compact' },
    session: WithSignedInMember.args.session
  }
};

/** Expanded puts it under the brand column, beside the links. */
export const ExpandedWithMember: Story = {
  name: 'Expanded (signed-in member)',
  args: {
    footer: { ...complete, variant: 'expanded' },
    session: WithSignedInMember.args.session
  }
};

/**
 * Nothing configured but a member signed in — the footer still renders, or
 * they would have nowhere to sign out from.
 */
export const MemberSlotOnly: Story = {
  name: 'Member slot only',
  args: {
    footer: {
      ...complete,
      contact: [],
      copyright: null,
      legalLinks: [],
      links: [],
      showVersion: false,
      tagline: null,
      variant: 'compact'
    },
    session: WithSignedInMember.args.session
  }
};

/** Everything stacks and centers below the `sm` breakpoint. */
export const MobileStandard: Story = {
  name: 'Mobile (standard)',
  args: Standard.args,
  globals: { viewport: { value: 'mobile1', isRotated: false } }
};

export const MobileExpanded: Story = {
  name: 'Mobile (expanded)',
  args: Expanded.args,
  globals: { viewport: { value: 'mobile1', isRotated: false } }
};

export const ShadcnLight = a11yStory(
  { args: Expanded.args },
  'shadcn',
  'light'
);
export const ShadcnDark = a11yStory({ args: Expanded.args }, 'shadcn', 'dark');
export const PayloadAdminLight = a11yStory(
  { args: Expanded.args },
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(
  { args: Expanded.args },
  'payload-admin',
  'dark'
);
export const SpotlightLight = a11yStory(
  { args: Expanded.args },
  'spotlight',
  'light'
);
export const SpotlightDark = a11yStory(
  { args: Expanded.args },
  'spotlight',
  'dark'
);
export const CodewareLight = a11yStory(
  { args: Expanded.args },
  'codeware',
  'light'
);
export const CodewareDark = a11yStory(
  { args: Expanded.args },
  'codeware',
  'dark'
);

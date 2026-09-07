import type { NavigationItem } from '@codeware/shared/util/payload-api';
import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { PayloadProvider, usePayload } from '../providers/PayloadProvider';
import type { Chrome } from '../theme/chrome';
import { ColorSchemeSwitch } from '../theme/ColorSchemeSwitch';
import { ThemeSelect } from '../theme/ThemeSelect';

import { DesktopNavigation } from './DesktopNavigation';
import { MobileNavigation } from './MobileNavigation';

/**
 * The header furniture, together.
 *
 * `chrome` is one decision for four components, so judging it a component at a
 * time misses the thing being judged. These stories put them in the
 * arrangement `RenderLayout` uses.
 */
const meta = {
  title: 'cms-renderer/Header chrome',
  parameters: { layout: 'padded' }
} satisfies Meta;

export default meta;

const navigationTree: Array<NavigationItem> = [
  { collection: 'pages', key: 'blocks', label: 'Blocks', url: '/blocks' },
  { collection: 'pages', key: 'studio', label: 'Studio', url: '/studio' },
  {
    collection: 'pages',
    key: 'architecture',
    label: 'Architecture',
    url: '/architecture'
  },
  { collection: 'pages', key: 'devlog', label: 'Devlog', url: '/devlog' }
];

/** The header as `RenderLayout` composes it: navigation left, controls right. */
function Header({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <DesktopNavigation
        navigationTree={navigationTree}
        className="max-md:hidden"
        // Two headers on one screen means two navigation landmarks, which a
        // page never has under the same name. Only the stories need this, so
        // an absent label leaves the component's own name in place.
        {...(label ? { 'aria-label': label } : {})}
      />
      <MobileNavigation navigationTree={navigationTree} className="md:hidden" />
      <div className="flex items-center gap-2">
        <ThemeSelect />
        <ColorSchemeSwitch />
      </div>
    </div>
  );
}

/**
 * Force one expression regardless of the toolbar, so both can sit on screen at
 * once. Everything else in the context is kept as the decorator built it.
 */
function AtChrome({ chrome, label }: { chrome: Chrome; label: string }) {
  const value = usePayload();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs tracking-[0.12em] uppercase">
        {label}
      </p>
      <PayloadProvider value={{ ...value, chrome }}>
        <Header label={label} />
      </PayloadProvider>
    </div>
  );
}

/** Follows the Chrome toolbar. */
export const Default: StoryObj = {
  render: () => <Header />
};

/**
 * Both expressions at once, which is the only way to judge the difference.
 *
 * `flat` is defined by what it removes — it drops the ring and the shadow and
 * leans on the surface token alone — so the case that decides whether it holds
 * up is a pale ground, not a dark one.
 */
export const BothExpressions: StoryObj = {
  name: 'Framed vs blended',
  render: () => (
    <div className="flex flex-col gap-10">
      <AtChrome chrome="outlined" label="Framed" />
      <AtChrome chrome="flat" label="Blended" />
    </div>
  )
};

const args = {};

export const ShadcnLight = a11yStory(
  { ...BothExpressions, args },
  'shadcn',
  'light'
);
export const ShadcnDark = a11yStory(
  { ...BothExpressions, args },
  'shadcn',
  'dark'
);
export const SpotlightLight = a11yStory(
  { ...BothExpressions, args },
  'spotlight',
  'light'
);
export const SpotlightDark = a11yStory(
  { ...BothExpressions, args },
  'spotlight',
  'dark'
);
export const CodewareLight = a11yStory(
  { ...BothExpressions, args },
  'codeware',
  'light'
);
export const CodewareDark = a11yStory(
  { ...BothExpressions, args },
  'codeware',
  'dark'
);

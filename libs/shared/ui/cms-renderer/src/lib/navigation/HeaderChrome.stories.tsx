import type { NavigationItem } from '@codeware/shared/util/payload-api';
import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  PayloadProvider,
  type PayloadValue,
  usePayload
} from '../providers/PayloadProvider';
import { type Chrome, segmentLimit } from '../theme/chrome';
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

/**
 * Cut the toolbar's theme list to `count`, keeping the selected one first.
 *
 * The decorator offers every theme Storybook knows about, which is more than a
 * segmented control will take — so without this the flat expression would only
 * ever show its fallback here.
 */
function trimThemes(value: PayloadValue, count: number) {
  const selected = value.themes.filter(({ value: v }) => v === value.theme);
  const rest = value.themes.filter(({ value: v }) => v !== value.theme);

  return [...selected, ...rest].slice(0, count);
}

/** The header as `RenderLayout` composes it: navigation left, controls right. */
function Header({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <DesktopNavigation
        navigationTree={navigationTree}
        className="max-md:hidden"
        // Several headers on one screen means several navigation landmarks,
        // which a page never has under the same name. Only the stories need
        // this, so an absent label leaves the component's own name in place.
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
 * Force one expression regardless of the toolbar, so several can sit on screen
 * at once. Everything else in the context is kept as the decorator built it.
 */
function AtChrome({
  chrome,
  label,
  themeCount = segmentLimit
}: {
  chrome: Chrome;
  label: string;
  /** How many themes the tenant offers, which is what picks the flat control */
  themeCount?: number;
}) {
  const value = usePayload();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs tracking-[0.12em] uppercase">
        {label}
      </p>
      <PayloadProvider
        value={{ ...value, chrome, themes: trimThemes(value, themeCount) }}
      >
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
 * Every expression at once, which is the only way to judge the difference.
 *
 * They differ in form, not only in trim: `outlined` is round, ringed and
 * lifted, and keeps each control's options behind an icon; `flat` is square,
 * filled, and shows them inline. The third row is that same flat expression
 * with more themes than a toolbar will hold — it falls back to a menu, but a
 * square one, so the variant survives its own fallback.
 */
export const BothExpressions: StoryObj = {
  name: 'Framed vs blended',
  render: () => (
    <div className="flex flex-col gap-10">
      <AtChrome chrome="outlined" label="Framed" />
      <AtChrome chrome="flat" label="Blended" />
      <AtChrome
        chrome="flat"
        label="Blended, past the segment limit"
        themeCount={segmentLimit + 2}
      />
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

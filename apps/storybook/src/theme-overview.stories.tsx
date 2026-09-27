import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  BRAND_TOKENS,
  CORE_TOKENS,
  PROSE_TOKENS,
  SHADCN_TOKENS,
  SIDEBAR_TOKENS,
  STORYBOOK_THEMES,
  type SbTheme,
  THEME_DARK_STRATEGIES
} from '../.storybook/themes-meta';

/** Renders a color swatch with its CSS variable name. */
const Swatch = ({ token }: { token: string }) => {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div
        className="h-4 w-4 shrink-0 rounded-sm border border-black/10"
        style={{ background: `var(${token})` }}
      />
      <span className="text-foreground truncate font-mono text-[11px]">
        {token.slice(2)}
      </span>
    </div>
  );
};

/** Renders a labeled group of color swatches in a two-column grid. */
const SwatchGroup = ({
  label,
  tokens
}: {
  label: string;
  tokens: readonly string[];
}) => {
  return (
    <section>
      <h3 className="text-foreground mb-1.5 text-[10px] font-bold tracking-widest uppercase">
        {label}
      </h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {tokens.map((t) => (
          <Swatch key={t} token={t} />
        ))}
      </div>
    </section>
  );
};

/** Renders the brand color palette as a horizontal strip of swatches. */
const BrandPalette = () => {
  return (
    <section>
      <h3 className="text-foreground mb-1.5 text-[10px] font-bold tracking-widest uppercase">
        brand
      </h3>
      <div className="flex gap-0.5 overflow-hidden rounded-sm">
        {BRAND_TOKENS.map((t) => (
          <div
            key={t}
            className="h-6 flex-1"
            style={{ background: `var(${t})` }}
            title={t}
          />
        ))}
      </div>
    </section>
  );
};

/** Renders all token groups and a sample UI for one theme in light or dark mode. */
const ThemePanel = ({
  theme,
  mode
}: {
  theme: SbTheme;
  mode: 'light' | 'dark';
}) => {
  const strategy = THEME_DARK_STRATEGIES[theme];
  const isDark = mode === 'dark';

  return (
    <div
      data-sb-theme={theme}
      data-theme={isDark && strategy === 'attribute' ? 'dark' : undefined}
      className={[
        'border-border bg-background space-y-3 rounded-lg border p-4',
        isDark && strategy === 'class' ? 'dark' : ''
      ]
        .join(' ')
        .trim()}
    >
      <div className="border-border flex items-center justify-between border-b pb-2">
        <span className="text-foreground text-xs font-semibold capitalize">
          {mode}
        </span>
        {isDark && (
          <code className="border-border text-foreground rounded border px-1 py-0.5 font-mono text-[9px]">
            {strategy === 'class' ? '.dark' : '[data-theme=dark]'}
          </code>
        )}
      </div>

      <SwatchGroup label="shadcn" tokens={SHADCN_TOKENS} />
      <SwatchGroup label="sidebar" tokens={SIDEBAR_TOKENS} />
      <BrandPalette />
      <SwatchGroup label="core" tokens={CORE_TOKENS} />
      <SwatchGroup label="prose" tokens={PROSE_TOKENS} />

      <section>
        <h3 className="text-foreground mb-1.5 text-[10px] font-bold tracking-widest uppercase">
          sample
        </h3>
        <div className="border-border border-t pt-3">
          <p className="text-foreground text-sm leading-relaxed">
            Body text.{' '}
            <strong className="text-foreground font-semibold">Bold.</strong>{' '}
            <a
              href="#"
              className="underline"
              style={{ color: 'var(--core-link)' }}
            >
              A link.
            </a>{' '}
            <span className="text-muted-foreground">Muted.</span>
          </p>
          <div className="mt-2 flex gap-2">
            <div className="bg-primary h-7 flex-1 rounded-sm" />
            <div className="bg-secondary h-7 flex-1 rounded-sm" />
            <div className="bg-accent h-7 flex-1 rounded-sm" />
            <div className="bg-muted h-7 flex-1 rounded-sm" />
          </div>
        </div>
      </section>
    </div>
  );
};

/** Renders light and dark ThemePanels side-by-side for a single theme. */
const ThemePair = ({ theme }: { theme: SbTheme }) => {
  return (
    <div className="grid grid-cols-2 gap-4 p-6">
      <ThemePanel theme={theme} mode="light" />
      <ThemePanel theme={theme} mode="dark" />
    </div>
  );
};

/** Renders light and dark panels for every registered Storybook theme. */
const AllThemesOverview = () => {
  return (
    <div className="space-y-10 p-6">
      {STORYBOOK_THEMES.map((theme) => (
        <div key={theme}>
          <h2 className="text-foreground mb-3 font-mono text-sm font-bold tracking-widest uppercase">
            {theme}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <ThemePanel theme={theme} mode="light" />
            <ThemePanel theme={theme} mode="dark" />
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Stories ──- //

const meta = {
  title: 'Theme/Overview',
  tags: ['!autodocs'],
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta;

export default meta;

/**
 * One story per theme, keyed by the registry.
 *
 * `satisfies Record<SbTheme, StoryObj>` is the point: a theme added to
 * `STORYBOOK_THEMES` without a story here stops compiling, instead of quietly
 * going unreviewed. A studio fork of Spotlight once reached the registry, `All Themes`
 * and the toolbar while this list still named four themes — the one view built for
 * looking at a single theme was the one place it was missing.
 *
 * Storybook needs a static named export per story, so the re-exports below stay
 * by hand; this object is what makes a missing one a type error.
 */
const themeStories = {
  frost: { name: 'frost', render: () => <ThemePair theme="frost" /> },
  'payload-admin': {
    name: 'payload-admin',
    render: () => <ThemePair theme="payload-admin" />
  },
  spotlight: {
    name: 'spotlight',
    render: () => <ThemePair theme="spotlight" />
  },
  codeware: { name: 'codeware', render: () => <ThemePair theme="codeware" /> },
  archipelago: {
    name: 'archipelago',
    render: () => <ThemePair theme="archipelago" />
  },
  midsummer: {
    name: 'midsummer',
    render: () => <ThemePair theme="midsummer" />
  },
  lingon: { name: 'lingon', render: () => <ThemePair theme="lingon" /> },
  granite: { name: 'granite', render: () => <ThemePair theme="granite" /> },
  aurora: { name: 'aurora', render: () => <ThemePair theme="aurora" /> },
  cement: { name: 'cement', render: () => <ThemePair theme="cement" /> }
} satisfies Record<SbTheme, StoryObj>;

export const Frost: StoryObj = themeStories.frost;

export const PayloadAdmin: StoryObj = themeStories['payload-admin'];

export const Spotlight: StoryObj = themeStories.spotlight;

export const Codeware: StoryObj = themeStories.codeware;

export const Archipelago: StoryObj = themeStories.archipelago;

export const Midsummer: StoryObj = themeStories.midsummer;

export const Lingon: StoryObj = themeStories.lingon;

export const Granite: StoryObj = themeStories.granite;

export const Aurora: StoryObj = themeStories.aurora;

export const Cement: StoryObj = themeStories.cement;

export const All: StoryObj = {
  name: 'All Themes',
  render: () => <AllThemesOverview />
};

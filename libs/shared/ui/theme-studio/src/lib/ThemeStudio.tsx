'use client';

import { CopyButton } from '@codeware/shared/ui/copy-button';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { Input } from '@codeware/shared/ui/shadcn/components/input';
import { Label } from '@codeware/shared/ui/shadcn/components/label';
import { Separator } from '@codeware/shared/ui/shadcn/components/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@codeware/shared/ui/shadcn/components/sheet';
import {
  Tabs,
  TabsList,
  TabsTrigger
} from '@codeware/shared/ui/shadcn/components/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@codeware/shared/ui/shadcn/components/tooltip';
import {
  type ColorFamily,
  type ColorShade,
  DEFAULT_RECIPE,
  NEUTRAL_FAMILIES,
  type ThemeRecipe,
  type ThemeTokens,
  brokenReferences,
  buildThemeTokens,
  checkContrast,
  codewareColors,
  fontsForSlot,
  randomRecipe,
  shade,
  themeFiles
} from '@codeware/shared/util/color';
import { createZip } from '@codeware/shared/util/pure';
import { cn } from '@codeware/shared/util/ui';
import {
  DicesIcon,
  DownloadIcon,
  PanelLeftIcon,
  TriangleAlertIcon
} from 'lucide-react';
import { createContext, useContext, useId, useMemo, useState } from 'react';

import { ContrastReport } from './ContrastReport';
import { OverridePanel, type ThemeOverrides } from './OverridePanel';
import { previewCss, previewScope } from './preview-css';
import { ThemePreview } from './ThemePreview';
import { tokenIssues } from './token-issues';

/** Ours, read off the palette so this cannot drift out of step with it. */
const CODEWARE_FAMILIES = Object.keys(
  codewareColors
) as ReadonlyArray<ColorFamily>;

const TAILWIND_HUES = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose'
] as const satisfies ReadonlyArray<ColorFamily>;

/**
 * Offered as brand colours, captioned rather than ruled.
 *
 * A swatch carries only its colour, so without the captions an author has to
 * hover across the row to find anything by name — and at the 500 step the
 * Codeware blue is hard to tell from `blue`, `sky` and `indigo` by eye.
 */
const BRAND_FAMILY_GROUPS = [
  { label: 'Tailwind', families: TAILWIND_HUES },
  { label: 'Codeware', families: CODEWARE_FAMILIES },
  { label: 'Neutral', families: NEUTRAL_FAMILIES }
] as const;

/**
 * Offered as base colours.
 *
 * Ours are here as well as under brand: the Codeware tenant site paints its
 * surfaces and body text from them, and a theme that cannot name them as its
 * base cannot reproduce that. A chromatic base tints every surface and border,
 * which the contrast report below will say plainly if it goes too far.
 */
const BASE_FAMILY_GROUPS = [
  { label: 'Neutral', families: NEUTRAL_FAMILIES },
  { label: 'Codeware', families: CODEWARE_FAMILIES }
] as const;

/**
 * Every family the brand picker offers, which is what it is measured against.
 *
 * `theme-studio.spec.ts` guards this against `COLOR_FAMILIES`: a family added
 * to the palette and not here is nameable by the parser and unreachable by the
 * author — which has already happened twice.
 */
export const BRAND_FAMILIES: ReadonlyArray<ColorFamily> =
  BRAND_FAMILY_GROUPS.flatMap((group) => [...group.families]);

const SURFACE_OPTIONS = [
  { label: 'Layered', value: 'layered' },
  { label: 'Flat', value: 'flat' }
] as const satisfies ReadonlyArray<{
  label: string;
  value: ThemeRecipe['surface'];
}>;

/**
 * The three decisions the committed themes make differently.
 *
 * Labelled by what a reader sees rather than by the token they set — "Brand"
 * and "Neutral" say what the buttons will look like, where `primarySource`
 * says nothing to anyone who has not read the template.
 */
const PRIMARY_OPTIONS = [
  { label: 'Brand', value: 'brand' },
  { label: 'Neutral', value: 'base' }
] as const satisfies ReadonlyArray<{
  label: string;
  value: ThemeRecipe['primarySource'];
}>;

const CHART_OPTIONS = [
  { label: 'From the brand', value: 'brand' },
  { label: 'shadcn', value: 'shadcn' },
  { label: 'Greyscale', value: 'base' }
] as const satisfies ReadonlyArray<{
  label: string;
  value: ThemeRecipe['chartSource'];
}>;

const LINK_OPTIONS = [
  { label: 'Its own step', value: 'brand' },
  { label: 'Follows the primary', value: 'primary' }
] as const satisfies ReadonlyArray<{
  label: string;
  value: ThemeRecipe['linkSource'];
}>;

const RADIUS_OPTIONS = [
  { label: 'Square', value: '0' },
  { label: 'Small', value: '0.35rem' },
  { label: 'Medium', value: '0.625rem' },
  { label: 'Large', value: '1rem' }
];

/** Link shades outside this range are either invisible or lost against body text. */
const LINK_SHADES: Array<ColorShade> = ['400', '500', '600', '700', '800'];

/** `yale-blue` reads as a slug; an author should see a name. */
const titleCase = (value: string) =>
  value
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/**
 * Where Radix should portal to.
 *
 * The studio is itself rendered into a portal by its host — in the Payload
 * admin, a fixed overlay at the top of the stack. Radix defaults to
 * `document.body`, which puts tooltips and sheets *beside* that overlay rather
 * than inside it, and they end up painted underneath. Handing them the studio's
 * own root keeps them in its stacking context.
 */
const PortalContainer = createContext<HTMLElement | null>(null);

/** Tooltip that lands inside the studio rather than behind it. */
function Hint({
  label,
  children
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  const container = useContext(PortalContainer);

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent container={container}>{label}</TooltipContent>
    </Tooltip>
  );
}

export type ThemeStudioResult = {
  recipe: ThemeRecipe;
  /** Only what was hand-edited; the rest follows the recipe */
  overrides: ThemeOverrides;
  tokensLight: ThemeTokens;
  tokensDark: ThemeTokens;
};

type ThemeStudioProps = {
  /**
   * Whether to offer the export to committed theme files.
   *
   * That output is a platform theme — files that ship in the CSS bundle to
   * every tenant, not a token map scoped to one site. Off unless the host says
   * otherwise: defaulting the other way hands it to whoever embeds the studio
   * next without them having to decide.
   */
  canExport?: boolean;
  /**
   * Whether to offer the licensed typefaces.
   *
   * Off by default for the same reason as `canExport`, and the licence makes it
   * sharper: a restricted face may only be embedded on a site Codeware owns, so
   * the host has to say yes rather than inherit it.
   *
   * This only hides the option. The collection refuses a restricted family it
   * is not entitled to, which is what actually holds — `recipe` is a JSON
   * column and never has to pass through this component at all.
   */
  canUseRestrictedFonts?: boolean;
  /**
   * The theme being edited, shown in the header.
   *
   * The studio fills the screen and is opened and closed repeatedly while
   * comparing themes, and nothing else on it says which one is loaded.
   */
  themeName?: string;
  /**
   * The folder the open theme lives in, when it is a committed one.
   *
   * Distinct from {@link themeName}, which is a display label: "Spotlight
   * Studio" is not `spotlight-fork`, and the write-back names a directory. Its
   * absence is meaningful — a theme the studio cannot identify is one it must
   * not offer to replace.
   */
  themeSlug?: string;
  /**
   * What the confirm button says.
   *
   * "Use this theme" is right when the studio is editing the theme it will
   * write back to. Opening a platform theme is not that — what the button does
   * there is fork it — and a button that does not say so is the whole reason
   * the action is hard to find.
   */
  selectLabel?: string;
  /** Recipe to open with, when editing an existing theme */
  recipe?: ThemeRecipe;
  /** Hand-edited tokens to restore alongside the recipe */
  overrides?: ThemeOverrides;
  /**
   * Whether the confirm button stays enabled while the theme has issues.
   *
   * Off by default: a theme being authored here should not ship with failing
   * contrast. On when the studio is opened on a theme that already had them —
   * a built-in's shortcomings are not the forker's to fix before they may
   * copy it, and the report stays on screen either way.
   */
  canSelectWithIssues?: boolean;
  onSelect?: (result: ThemeStudioResult) => void;
  onClose?: () => void;
};

const NO_OVERRIDES: ThemeOverrides = { light: {}, dark: {} };

/**
 * Swatches under a caption naming what they are.
 *
 * The caption is the separation: a rule between groups read as clutter, and a
 * name is what an author picking a family actually needs, since the swatch
 * itself says nothing until hovered.
 */
function SwatchGroups({
  groups,
  selected,
  onSelect
}: {
  groups: ReadonlyArray<{
    label: string;
    families: ReadonlyArray<ColorFamily>;
  }>;
  selected: ColorFamily;
  onSelect: (family: ColorFamily) => void;
}) {
  return (
    <div className="space-y-2">
      {groups.map(({ label, families }) => (
        <div key={label} className="space-y-1">
          <p className="text-muted-foreground/70 text-[10px] tracking-wide uppercase">
            {label}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {families.map((family) => (
              <Swatch
                key={family}
                family={family}
                selected={selected === family}
                onSelect={() => onSelect(family)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Swatch({
  family,
  selected,
  onSelect
}: {
  family: ColorFamily;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Hint label={titleCase(family)}>
      <button
        type="button"
        onClick={onSelect}
        aria-label={titleCase(family)}
        aria-pressed={selected}
        className={cn(
          'focus-visible:ring-ring size-7 rounded-md border transition-all focus-visible:ring-2 focus-visible:outline-none',
          selected
            ? 'ring-ring border-transparent ring-2 ring-offset-2'
            : 'border-border hover:scale-110'
        )}
        style={{ background: shade(family, '500') }}
      />
    </Hint>
  );
}

function Pill({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-md border px-2 py-1 text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border hover:bg-accent'
      )}
    >
      {children}
    </button>
  );
}

/**
 * Author a theme from a recipe, with both schemes visible and checked.
 *
 * Four decisions drive all 84 light and 32 dark tokens — the core and prose
 * layers are fixed plumbing, and the shadcn layer is a set of steps off one
 * family. Exposing the tokens themselves would be a worse product and a longer
 * form; the ones that resist a recipe get a per-token override instead.
 *
 * The preview is scoped to its containers rather than the page, so light and
 * dark render together without an iframe and without touching `<html>`.
 */
export function ThemeStudio({
  canExport = false,
  canUseRestrictedFonts = false,
  themeName,
  themeSlug,
  selectLabel = 'Use this theme',
  canSelectWithIssues = false,
  recipe: initialRecipe,
  overrides: initialOverrides,
  onSelect,
  onClose
}: ThemeStudioProps = {}) {
  const scope = useId().replace(/:/g, '');
  const [recipe, setRecipe] = useState<ThemeRecipe>(
    initialRecipe ?? DEFAULT_RECIPE
  );
  const [overrides, setOverrides] = useState<ThemeOverrides>(
    initialOverrides ?? NO_OVERRIDES
  );
  const [scheme, setScheme] = useState<'light' | 'dark' | 'both'>('both');
  const [optionsOpen, setOptionsOpen] = useState(true);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  // Seeded from the open theme, not left at a placeholder. The name is not
  // decoration: it is the folder the zip unpacks to and the theme the
  // write-back replaces, so defaulting it to `my-theme` while `spotlight-fork`
  // was on screen produced a payload naming a theme that does not exist
  const [exportName, setExportName] = useState(themeSlug ?? 'my-theme');

  // What the recipe alone produces — the override panel needs it to show what
  // a token would revert to
  const generated = useMemo(() => buildThemeTokens(recipe), [recipe]);
  const { light, dark } = useMemo(
    () => buildThemeTokens(recipe, overrides),
    [recipe, overrides]
  );

  // Dark holds only what changes, so it is checked as the browser cascades it
  const contrast = useMemo(
    () => ({
      light: checkContrast(light),
      dark: checkContrast({ ...light, ...dark })
    }),
    [light, dark]
  );

  // A dangling alias is not a contrast failure — it is the absence of a colour,
  // which the contrast check cannot see because the pair drops out of it
  const broken = useMemo(
    () => [
      ...brokenReferences(light).map((entry) => ({
        ...entry,
        scheme: 'Light'
      })),
      ...brokenReferences({ ...light, ...dark }).map((entry) => ({
        ...entry,
        scheme: 'Dark'
      }))
    ],
    [light, dark]
  );

  // The reports say what is wrong with the theme; this says which row to edit
  const issues = useMemo(
    () => ({
      light: tokenIssues(
        contrast.light,
        broken.filter(({ scheme: on }) => on === 'Light')
      ),
      dark: tokenIssues(
        contrast.dark,
        broken.filter(({ scheme: on }) => on === 'Dark')
      )
    }),
    [contrast, broken]
  );

  const failures =
    contrast.light.filter(({ passes }) => !passes).length +
    contrast.dark.filter(({ passes }) => !passes).length +
    broken.length;

  const overrideCount =
    Object.keys(overrides.light).length + Object.keys(overrides.dark).length;

  const files = useMemo(
    () => themeFiles(exportName, recipe, overrides),
    [exportName, recipe, overrides]
  );

  const themeJson = useMemo(
    () =>
      JSON.stringify({ recipe, tokensLight: light, tokensDark: dark }, null, 2),
    [recipe, light, dark]
  );

  /** The folder the archive unpacks to, sanitised the way a slug is. */
  const folder =
    exportName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'my-theme';

  /**
   * Save a file, under the name asked for.
   *
   * The anchor is put in the document before it is clicked and taken out after.
   * A detached anchor is enough in Chrome, and is not in Firefox; Safari can
   * ignore `download` on a detached one pointing at a `blob:` URL and navigate
   * instead — at which point the browser names the file after the page, which
   * is how a theme called `codeware` was saved as `Payload Theme.json`.
   *
   * A `File` rather than a `Blob` for the same reason: it carries the name
   * itself, so a browser that disregards the attribute still has one to use.
   */
  const download = (name: string, parts: BlobPart[], type: string) => {
    const url = URL.createObjectURL(new File(parts, name, { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.rel = 'noopener';
    link.style.display = 'none';

    document.body.append(link);
    link.click();
    link.remove();

    // Revoking in the same tick can cancel or truncate the download in some
    // browsers — the click only queues it
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const downloadZip = () =>
    download(
      `${folder}.zip`,
      [
        createZip(
          Object.fromEntries(
            Object.entries(files).map(([name, contents]) => [
              `${folder}/${name}`,
              contents
            ])
          ) as never
        ) as BlobPart
      ],
      'application/zip'
    );

  /**
   * The payload `dev-plugin:theme-write` reads.
   *
   * The generated CSS rather than the recipe: what lands in the repository is
   * then exactly what this screen was showing, with nothing rebuilt in between
   * from a recipe that travelled separately.
   *
   * `tailwind-base.css` is left out on purpose. The generator refuses to write
   * it anyway — a theme's own `@theme inline` block is not the studio's to
   * rewrite — so sending it would only invite the question.
   */
  const downloadWriteBack = () =>
    download(
      `${folder}.theme.json`,
      [
        JSON.stringify(
          {
            name: folder,
            files: {
              'tokens-light.css': files['tokens-light.css'],
              'tokens-dark.css': files['tokens-dark.css']
            }
          },
          null,
          2
        )
      ],
      'application/json'
    );

  const ids = previewScope(scope);
  const update = (patch: Partial<ThemeRecipe>) =>
    setRecipe((current) => ({ ...current, ...patch }));

  return (
    <TooltipProvider>
      <PortalContainer.Provider value={root}>
        <div
          ref={setRoot}
          className="bg-background text-foreground flex h-screen max-h-full overflow-hidden"
        >
          <style>{previewCss(scope, light, dark)}</style>

          {optionsOpen && (
            <aside className="border-border bg-muted/30 flex min-h-0 w-72 shrink-0 flex-col border-r">
              <div className="flex h-12 shrink-0 flex-col justify-center border-b px-4">
                <h2 className="text-sm font-semibold">
                  {themeName ?? 'Theme studio'}
                </h2>
                {themeName && (
                  <span className="text-muted-foreground text-[11px]">
                    Theme studio
                  </span>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="space-y-5 p-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Base colour</Label>
                    <p className="text-muted-foreground text-[11px]">
                      Every surface, border and neutral text.
                    </p>
                    <SwatchGroups
                      groups={BASE_FAMILY_GROUPS}
                      selected={recipe.baseFamily}
                      onSelect={(family) => update({ baseFamily: family })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Brand colour</Label>
                    <p className="text-muted-foreground text-[11px]">
                      Primary buttons, focus rings, links, active navigation and
                      the chart series.
                    </p>
                    <SwatchGroups
                      groups={BRAND_FAMILY_GROUPS}
                      selected={recipe.brandFamily}
                      onSelect={(family) => update({ brandFamily: family })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Headings</Label>
                    <p className="text-muted-foreground text-[11px]">
                      Pairs a display face with a readable body one. Match the
                      body font to keep the page quiet.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {fontsForSlot('heading', canUseRestrictedFonts).map(
                        (font) => (
                          <Pill
                            key={font.id}
                            active={recipe.fontHeading === font.id}
                            onClick={() => update({ fontHeading: font.id })}
                          >
                            {font.label}
                          </Pill>
                        )
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Body text</Label>
                    <p className="text-muted-foreground text-[11px]">
                      Everything a visitor reads at length.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {fontsForSlot('body', canUseRestrictedFonts).map(
                        (font) => (
                          <Pill
                            key={font.id}
                            active={recipe.fontBody === font.id}
                            onClick={() => update({ fontBody: font.id })}
                          >
                            {font.label}
                          </Pill>
                        )
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Page surface</Label>
                    <p className="text-muted-foreground text-[11px]">
                      Whether the content sits on its own surface, framed by the
                      margins and footer, or shares one with them.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {SURFACE_OPTIONS.map(({ label, value }) => (
                        <Pill
                          key={value}
                          active={recipe.surface === value}
                          onClick={() => update({ surface: value })}
                        >
                          {label}
                        </Pill>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Buttons and rings</Label>
                    <p className="text-muted-foreground text-[11px]">
                      Whether the primary button, focus ring and active sidebar
                      carry the brand colour or stay neutral.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {PRIMARY_OPTIONS.map(({ label, value }) => (
                        <Pill
                          key={value}
                          active={recipe.primarySource === value}
                          onClick={() => update({ primarySource: value })}
                        >
                          {label}
                        </Pill>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Chart series</Label>
                    <p className="text-muted-foreground text-[11px]">
                      Five colours spaced off the brand, shadcn&apos;s published
                      set, or a greyscale ramp.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {CHART_OPTIONS.map(({ label, value }) => (
                        <Pill
                          key={value}
                          active={recipe.chartSource === value}
                          onClick={() => update({ chartSource: value })}
                        >
                          {label}
                        </Pill>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="text-xs">Corner radius</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {RADIUS_OPTIONS.map(({ label, value }) => (
                        <Pill
                          key={value}
                          active={recipe.radius === value}
                          onClick={() => update({ radius: value })}
                        >
                          {label}
                        </Pill>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Link colour</Label>
                    <p className="text-muted-foreground text-[11px]">
                      A link can take its own step of the brand ramp, or simply
                      be the primary colour.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {LINK_OPTIONS.map(({ label, value }) => (
                        <Pill
                          key={value}
                          active={recipe.linkSource === value}
                          onClick={() => update({ linkSource: value })}
                        >
                          {label}
                        </Pill>
                      ))}
                    </div>
                  </div>

                  {/* The shade means nothing once links follow the primary, and
                      a control that changes no colour reads as a broken one */}
                  <div
                    className="space-y-2"
                    hidden={recipe.linkSource === 'primary'}
                  >
                    <Label className="text-xs">Link strength</Label>
                    <p className="text-muted-foreground text-[11px]">
                      Which step of the brand ramp links take.
                    </p>
                    {(['light', 'dark'] as const).map((forScheme) => (
                      <div key={forScheme} className="space-y-1">
                        <span className="text-muted-foreground text-[11px] capitalize">
                          {forScheme}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {LINK_SHADES.map((step) => (
                            <Pill
                              key={step}
                              active={recipe.linkShade[forScheme] === step}
                              onClick={() =>
                                update({
                                  linkShade: {
                                    ...recipe.linkShade,
                                    [forScheme]: step
                                  }
                                })
                              }
                            >
                              {step}
                            </Pill>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <Label className="text-xs">Readability</Label>
                    <ContrastReport scheme="Light" results={contrast.light} />
                    <ContrastReport scheme="Dark" results={contrast.dark} />
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full">
                          Fine-tune tokens
                          {overrideCount > 0 && ` (${overrideCount})`}
                        </Button>
                      </SheetTrigger>
                      <SheetContent
                        side="left"
                        container={root}
                        size="lg"
                        className="flex flex-col gap-4 p-4"
                      >
                        <SheetHeader className="p-0">
                          <SheetTitle>Fine-tune tokens</SheetTitle>
                          <SheetDescription>
                            An edited token stops following the recipe, so
                            changing the brand or base later leaves it behind.
                          </SheetDescription>
                        </SheetHeader>
                        <OverridePanel
                          generated={generated}
                          container={root}
                          overrides={overrides}
                          issues={issues}
                          onChange={setOverrides}
                        />
                      </SheetContent>
                    </Sheet>

                    {canExport && (
                      <Sheet>
                        <SheetTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                          >
                            Export theme files
                          </Button>
                        </SheetTrigger>
                        <SheetContent
                          side="left"
                          container={root}
                          size="lg"
                          className="flex flex-col gap-4 p-4"
                        >
                          <SheetHeader className="p-0">
                            <SheetTitle>Export theme files</SheetTitle>
                            <SheetDescription>
                              A committed theme rather than one injected at
                              runtime. Palette colours are written as aliases
                              here, because these files are compiled.
                            </SheetDescription>
                          </SheetHeader>

                          <div className="space-y-1">
                            <Label className="text-xs">Theme name</Label>
                            <Input
                              value={exportName}
                              onChange={(event) =>
                                setExportName(event.target.value)
                              }
                              aria-label="Theme name"
                              placeholder="my-theme"
                              className="h-8 font-mono text-xs"
                            />
                            <p className="text-muted-foreground text-[11px]">
                              The folder this theme lives in. Everything below
                              uses it.
                            </p>
                          </div>

                          <Separator />

                          {/* Three outcomes, not one download with footnotes.
                              They differ by where the files end up, and only
                              the last needs the theme to already exist */}
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5">
                                <Label className="text-xs">
                                  1. Take the files away
                                </Label>
                                <p className="text-muted-foreground text-[11px]">
                                  All three files as an archive, to inspect or
                                  keep.
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="shrink-0"
                                onClick={downloadZip}
                              >
                                <DownloadIcon className="size-4" />
                                {folder}.zip
                              </Button>
                            </div>
                          </div>

                          <Separator />

                          <div className="space-y-2">
                            <Label className="text-xs">
                              2. Add it as a new platform theme
                            </Label>
                            <p className="text-muted-foreground text-[11px]">
                              Ships in the CSS bundle to every tenant, and every
                              site may then select it.
                            </p>
                            <ol className="text-muted-foreground space-y-2 text-xs">
                              <li>
                                <span className="text-foreground font-medium">
                                  Unpack into the theme library
                                </span>
                                <pre className="bg-muted mt-1 overflow-x-auto rounded-md p-2 font-mono text-[11px]">
                                  {`unzip ~/Downloads/${folder}.zip -d libs/shared/theme/src/lib/`}
                                </pre>
                              </li>
                              <li>
                                <span className="text-foreground font-medium">
                                  Register it
                                </span>
                                <p className="mt-1">
                                  Add <code>&apos;{folder}&apos;</code> to{' '}
                                  <code>SITE_THEMES</code> in{' '}
                                  <code>themes.ts</code>, and a display name in{' '}
                                  <code>theme-labels.ts</code>.
                                </p>
                              </li>
                              <li>
                                <span className="text-foreground font-medium">
                                  Regenerate
                                </span>
                                <pre className="bg-muted mt-1 overflow-x-auto rounded-md p-2 font-mono text-[11px]">
                                  {'nx daemon --stop && nx sync'}
                                </pre>
                                <p className="mt-1">
                                  The stop is needed <em>here</em> because
                                  registering the theme edits the generator
                                  itself, and the daemon caches the compiled
                                  copy — skipping it reports everything already
                                  up to date.
                                </p>
                              </li>
                            </ol>
                          </div>

                          <Separator />

                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5">
                                <Label className="text-xs">
                                  3. Replace an existing platform theme
                                </Label>
                                <p className="text-muted-foreground text-[11px]">
                                  {themeSlug
                                    ? `Overwrites ${themeSlug}'s two token files in place and leaves the rest of its folder alone.`
                                    : 'Open a platform theme from the theme library to replace one — this studio does not know which theme it would be writing over.'}
                                </p>
                              </div>
                              {themeSlug && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="shrink-0"
                                  onClick={downloadWriteBack}
                                >
                                  <DownloadIcon className="size-4" />
                                  {folder}.theme.json
                                </Button>
                              )}
                            </div>
                            {themeSlug && (
                              <>
                                <pre className="bg-muted overflow-x-auto rounded-md p-2 font-mono text-[11px]">
                                  {`nx g dev-plugin:theme-write --from=~/Downloads/${folder}.theme.json`}
                                </pre>
                                <p className="text-muted-foreground text-[11px]">
                                  Then <code>nx sync</code> to regenerate the
                                  stylesheets and check the result against the
                                  token contract.
                                </p>
                              </>
                            )}
                          </div>
                        </SheetContent>
                      </Sheet>
                    )}

                    <Sheet>
                      <SheetTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full">
                          View theme JSON
                        </Button>
                      </SheetTrigger>
                      <SheetContent
                        side="left"
                        container={root}
                        size="lg"
                        className="flex flex-col gap-4 p-4"
                      >
                        <SheetHeader className="p-0">
                          <SheetTitle>Theme JSON</SheetTitle>
                          <SheetDescription>
                            The recipe and both token maps, exactly as they are
                            stored.
                          </SheetDescription>
                        </SheetHeader>
                        <div className="relative min-h-0 flex-1">
                          <CopyButton
                            code={themeJson}
                            label="Copy theme JSON"
                          />
                          <div className="h-full overflow-auto">
                            <pre className="bg-muted rounded-md p-3 pr-12 font-mono text-[11px] leading-relaxed">
                              {themeJson}
                            </pre>
                          </div>
                        </div>
                      </SheetContent>
                    </Sheet>
                  </div>
                </div>
              </div>
            </aside>
          )}

          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="border-border flex h-12 shrink-0 items-center justify-between gap-3 border-b px-5">
              <div className="flex items-center gap-3">
                <Hint label={optionsOpen ? 'Hide options' : 'Show options'}>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={
                      optionsOpen ? 'Hide theme options' : 'Show theme options'
                    }
                    aria-expanded={optionsOpen}
                    onClick={() => setOptionsOpen((open) => !open)}
                  >
                    <PanelLeftIcon className="size-4" />
                  </Button>
                </Hint>

                {/* Lives here rather than in the panel, so it survives collapsing */}
                <Hint label="Feeling lucky — rolls a recipe that passes contrast. Any fine-tuned tokens are kept.">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={() => setRecipe(randomRecipe())}
                    aria-label="Shuffle the theme"
                  >
                    <DicesIcon className="size-4" />
                  </Button>
                </Hint>

                <Tabs
                  value={scheme}
                  onValueChange={(value) =>
                    setScheme(value as 'light' | 'dark' | 'both')
                  }
                >
                  <TabsList>
                    <TabsTrigger value="light">Light</TabsTrigger>
                    <TabsTrigger value="dark">Dark</TabsTrigger>
                    <TabsTrigger value="both">Both</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="flex items-center gap-2">
                {failures > 0 && (
                  <span className="border-destructive/40 bg-destructive/10 text-destructive-subtle flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium">
                    <TriangleAlertIcon className="size-3.5" />
                    {failures} contrast {failures === 1 ? 'issue' : 'issues'}
                  </span>
                )}
                {onSelect && (
                  <Button
                    size="sm"
                    disabled={failures > 0 && !canSelectWithIssues}
                    title={
                      failures > 0 && !canSelectWithIssues
                        ? 'Fix the contrast issues before using this theme'
                        : undefined
                    }
                    onClick={() =>
                      onSelect({
                        recipe,
                        overrides,
                        tokensLight: light,
                        tokensDark: dark
                      })
                    }
                  >
                    {selectLabel}
                  </Button>
                )}
                {onClose && (
                  <Button size="sm" variant="ghost" onClick={onClose}>
                    Close
                  </Button>
                )}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div
                className={cn(
                  'gap-4 p-5',
                  scheme === 'both' ? 'grid lg:grid-cols-2' : 'flex flex-col'
                )}
              >
                {scheme !== 'dark' && <ThemePreview id={ids.light} />}
                {scheme !== 'light' && <ThemePreview id={ids.dark} dark />}
              </div>
            </div>
          </main>
        </div>
      </PortalContainer.Provider>
    </TooltipProvider>
  );
}

export default ThemeStudio;

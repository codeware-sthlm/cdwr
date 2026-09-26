import type { SiteTheme } from '@codeware/shared/theme';

/**
 * The part of a site definition this reads: its pages and its landing page.
 *
 * Restated rather than imported as `SiteDefinition`, for the reason
 * `apply-site.logic` gives: the definition's types reach Payload's generated
 * types, which bring Payload and Next's globals into the CLI. The definition is
 * checked against this shape when it is loaded, so a renamed field fails there
 * rather than producing no routes.
 */
export type RoutedDefinition = {
  pages: ReadonlyArray<{ slug: string }>;
  siteSettings?: { general?: { landingPage?: { lookupSlug: string } } };
};

/** Whether a loaded module's default export has the shape `routesOf` reads */
export const isRoutedDefinition = (value: unknown): value is RoutedDefinition =>
  typeof value === 'object' &&
  value !== null &&
  'pages' in value &&
  Array.isArray(value.pages) &&
  value.pages.every(
    (page: unknown) =>
      typeof page === 'object' &&
      page !== null &&
      'slug' in page &&
      typeof page.slug === 'string'
  );

/** What `prefers-color-scheme` can be told, which is what the site follows */
export const COLOR_SCHEMES = ['light', 'dark'] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

/** The screens a page is drawn on; a new name fails to compile without a size */
export const VIEWPORT_NAMES = ['phone', 'desktop'] as const;
export type ViewportName = (typeof VIEWPORT_NAMES)[number];

export const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 900 }
} as const satisfies Record<ViewportName, { width: number; height: number }>;

/** One page, drawn one way */
export type Shot = {
  route: string;
  theme: SiteTheme;
  colorScheme: ColorScheme;
  viewport: ViewportName;
};

/** Why a shot was not taken, when the site would not draw what was asked */
export type SkipReason = 'theme-not-offered' | 'scheme-locked';

export type ShotResult = Shot & {
  /** The PNG, or nothing when the shot was skipped */
  path: string | null;
  /** The page's HTTP status; null when it never answered */
  status: number | null;
  /** What the browser console reported as an error while the page loaded */
  consoleErrors: Array<string>;
  skipped?: SkipReason;
};

/**
 * The routes a definition's pages are served at.
 *
 * The landing page is `/`, not its own slug, so it comes first and under that
 * path; every other page is `/<slug>`, in the order the definition states them.
 */
export function routesOf(definition: RoutedDefinition): Array<string> {
  const landing = definition.siteSettings?.general?.landingPage?.lookupSlug;
  const others = definition.pages
    .filter(({ slug }) => slug !== landing)
    .map(({ slug }) => `/${slug}`);

  return landing ? ['/', ...others] : others;
}

/** Reads `--routes`: comma-separated paths, each given a leading slash */
export const parseRoutes = (value: string): Array<string> =>
  value
    .split(',')
    .map((route) => route.trim())
    .filter(Boolean)
    .map((route) => (route.startsWith('/') ? route : `/${route}`));

/**
 * Every shot to take, grouped so one browser setting serves a run of pages.
 *
 * Theme, scheme and viewport vary slowest because each is a browser context;
 * the route varies fastest because it is only a navigation.
 */
export function shotsOf(
  routes: ReadonlyArray<string>,
  themes: ReadonlyArray<SiteTheme>,
  colorSchemes: ReadonlyArray<ColorScheme>,
  viewports: ReadonlyArray<ViewportName>
): Array<Shot> {
  return themes.flatMap((theme) =>
    colorSchemes.flatMap((colorScheme) =>
      viewports.flatMap((viewport) =>
        routes.map((route) => ({ route, theme, colorScheme, viewport }))
      )
    )
  );
}

/**
 * A route as a file name part: `/` is `index`, anything else keeps only
 * letters, digits, dots, dashes and underscores.
 *
 * A route can come from `--routes`, and a path separator left in it (a
 * backslash on Windows) would let the file land outside the output folder.
 */
export const routeName = (route: string): string => {
  const name = route.replace(/[^a-z0-9._-]+/gi, '-').replace(/^[-.]+|-+$/g, '');
  return name || 'index';
};

export const fileName = ({
  route,
  theme,
  colorScheme,
  viewport
}: Shot): string =>
  `${routeName(route)}--${theme}-${colorScheme}-${viewport}.png`;

/** `localhost:3000` as a folder name */
export const hostFolder = (url: string): string =>
  new URL(url).host.replace(/[^a-z0-9.-]/gi, '-');

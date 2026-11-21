import { SITE_THEMES } from '@codeware/shared/theme';
import {
  SITE_GATE_COOKIE,
  createSiteGateToken
} from '@codeware/shared/util/site-gate';

import {
  COLOR_SCHEMES,
  type ColorScheme,
  VIEWPORTS,
  VIEWPORT_NAMES,
  type ViewportName
} from '../../services/snapshot-matrix';

// Re-exported so the command keeps importing everything from here
export { COLOR_SCHEMES, VIEWPORTS, VIEWPORT_NAMES };
export type { ColorScheme, ViewportName };

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

/**
 * The themes a shot can ask for: a built-in by name, or `default`, which sends
 * no theme cookie and so shows whatever a first visit shows. That is the only
 * way to see a theme the site authored itself, which has no name here.
 */
export const SNAPSHOT_THEMES = ['default', ...SITE_THEMES] as const;
export type SnapshotTheme = (typeof SNAPSHOT_THEMES)[number];

/** One page, drawn one way */
export type Shot = {
  route: string;
  theme: SnapshotTheme;
  colorScheme: ColorScheme;
  viewport: ViewportName;
};

/** Why a shot was not taken, when the site would not draw what was asked */
export type SkipReason = 'theme-not-offered' | 'scheme-locked';

/**
 * Where a page's sections sit, top to bottom, as the browser laid them out.
 *
 * Only sections spanning the page: a band nested in a column is a panel, and
 * its distance to the next is spacing, not a strip.
 */
export type PageBox =
  | { kind: 'section'; band: string; top: number; bottom: number }
  | { kind: 'footer'; top: number };

/** A strip of page left showing where two bands, or a band and the footer, should meet */
export type StrayStrip = {
  /** The band above, as its `data-band` says */
  above: string;
  /** The band below, or `footer` */
  below: string;
  /** Height of the strip in CSS pixels */
  px: number;
};

/** Anything under a pixel is rounding, not a strip */
const STRIP_TOLERANCE = 1;

/**
 * The strips of page between sections that should meet.
 *
 * A band is set apart by its background, so two bands in a row, or a band
 * right before the footer, belong edge to edge; space between them shows the
 * page through as a stray strip. A section without a band is spaced as usual.
 *
 * @param boxes - The page's sections and footer, top to bottom
 */
export function findStrips(boxes: ReadonlyArray<PageBox>): Array<StrayStrip> {
  const strips: Array<StrayStrip> = [];

  for (const [index, box] of boxes.entries()) {
    const next = boxes[index + 1];
    if (box.kind !== 'section' || box.band === 'none' || !next) {
      continue;
    }
    if (next.kind === 'section' && next.band === 'none') {
      continue;
    }

    const px = Math.round(next.top - box.bottom);
    if (px > STRIP_TOLERANCE) {
      strips.push({
        above: box.band,
        below: next.kind === 'footer' ? 'footer' : next.band,
        px
      });
    }
  }

  return strips;
}

export type ShotResult = Shot & {
  /** The PNG, or nothing when the shot was skipped */
  path: string | null;
  /** The theme the page actually drew, as its `data-theme` says */
  drawnTheme: string | null;
  /** The page's HTTP status; null when it never answered */
  status: number | null;
  /** What the browser console reported as an error while the page loaded */
  consoleErrors: Array<string>;
  /** Page showing where bands, or a band and the footer, should meet */
  strips: Array<StrayStrip>;
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
  themes: ReadonlyArray<SnapshotTheme>,
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

/** How long a minted gate cookie lasts: one run, with room for a slow site */
const GATE_COOKIE_SECONDS = 60 * 60;

/**
 * The cookie that lets a browser through a site's gate, as a visitor who typed
 * the password would have it.
 *
 * Minted here with the same signing the site verifies, so no form is sent and
 * the password never travels. Without a password there is no cookie, and a
 * gated site shows its gate page. `HttpOnly` and `Lax` as the site sets it, so
 * no script on an audited page can read the token.
 *
 * @param url - The site, so the cookie is scoped to its host
 * @param password - The site gate password for this tenant and environment
 */
export const gateCookies = (
  url: string,
  password: string | undefined,
  now = Date.now()
): Array<{
  name: string;
  value: string;
  url: string;
  httpOnly: true;
  sameSite: 'Lax';
}> =>
  password
    ? [
        {
          name: SITE_GATE_COOKIE,
          value: createSiteGateToken(password, {
            maxAgeSeconds: GATE_COOKIE_SECONDS,
            now
          }),
          // The root, so the cookie's path is `/`; Playwright takes a url or a
          // path, not both
          url: new URL('/', url).href,
          httpOnly: true,
          sameSite: 'Lax'
        }
      ]
    : [];

/** What the first page answered with, read by `assertPastGate` */
export type GateSignals = {
  /** The `x-robots-tag` response header, if any */
  robotsTag: string | null;
  /** Whether the page has the gate's password field */
  gateField: boolean;
};

/**
 * The reason to stop when the gate page answered instead of the site, or `null`.
 *
 * Both signals are required: the proxy's `noindex` header and the gate's
 * password field. A future noindex page, or a page that mentions the gate,
 * is not taken for it. The advice depends on whether a cookie was sent.
 */
export const gateProblem = (
  signals: GateSignals,
  cookieSent: boolean
): string | null => {
  if (!signals.robotsTag?.toLowerCase().includes('noindex')) return null;
  if (!signals.gateField) return null;
  return cookieSent
    ? "The gate page answered although a gate cookie was sent: the --gate-password does not match this site's SITE_GATE_PASSWORD, or the site answers from another host than --url (the cookie is scoped to it). Pass the production value, in single quotes; zsh rewrites $ and ! in an unquoted one."
    : "The gate page answered: the site is gated. Pass --gate-password with the site's SITE_GATE_PASSWORD, in single quotes.";
};

/** `localhost:3000` as a folder name */
export const hostFolder = (url: string): string =>
  new URL(url).host.replace(/[^a-z0-9.-]/gi, '-');

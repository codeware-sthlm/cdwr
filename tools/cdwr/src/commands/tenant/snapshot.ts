import { mkdirSync } from 'fs';
import { join, relative } from 'path';
import { pathToFileURL } from 'url';

import { THEME_COOKIE } from '@codeware/shared/theme';

import { defineCommand } from '../../cli/command';
import { input } from '../../cli/inputs';
import {
  definitionInput,
  resolveDefinitionPath
} from '../../services/site-definitions';

import {
  COLOR_SCHEMES,
  type ColorScheme,
  type RoutedDefinition,
  SNAPSHOT_THEMES,
  type Shot,
  type ShotResult,
  type SkipReason,
  type SnapshotTheme,
  VIEWPORTS,
  VIEWPORT_NAMES,
  type ViewportName,
  fileName,
  findStrips,
  hostFolder,
  isRoutedDefinition,
  parseRoutes,
  routesOf,
  shotsOf
} from './snapshot.logic';

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

async function loadDefinition(path: string): Promise<RoutedDefinition> {
  const imported = (await import(pathToFileURL(path).href)) as {
    default?: unknown;
  };
  if (!isRoutedDefinition(imported.default)) {
    throw new Error(
      `${path} does not export a site definition with pages as its default`
    );
  }
  return imported.default;
}

/** `--routes` when given, otherwise the pages of the definition */
async function routesFrom(
  root: string,
  routes: string | undefined,
  definition: string | undefined
): Promise<Array<string>> {
  if (routes?.trim()) {
    return parseRoutes(routes);
  }
  if (!definition) {
    throw new Error('Name a definition, or pass --routes');
  }
  return routesOf(
    await loadDefinition(resolveDefinitionPath(root, definition))
  );
}

/** How long the first request may take: a dev server compiles on demand */
const FIRST_ANSWER_MS = 60_000;

/**
 * Fails early and plainly when there is no site to look at.
 *
 * Nothing listening and a server still compiling its first page need different
 * advice, and only the timeout tells them apart: a refused connection is
 * immediate.
 */
async function assertAnswers(url: string): Promise<void> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(FIRST_ANSWER_MS) });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error(
        `${url} did not answer within ${FIRST_ANSWER_MS / 1000}s. A dev server compiles a page on its first request; open it once, then run this again.`
      );
    }
    throw new Error(
      `Nothing answers at ${url}. Start the site first, for example with \`nx dev cms\`.`
    );
  }
}

/** A key per browser setting, so a run of routes shares one context */
const settingOf = ({ theme, colorScheme, viewport }: Shot) =>
  `${theme}|${colorScheme}|${viewport}`;

/**
 * Screenshots of a site's pages, the way a visitor would see them.
 *
 * The theme is chosen through the same cookie the theme switch sets, and the
 * colour scheme through the system preference the site follows, so what is
 * drawn is what the site really serves. A site that does not offer a theme, or
 * locks its scheme, draws something else; that is reported rather than saved
 * under a name that would claim otherwise.
 */
export default defineCommand<
  {
    url: ReturnType<typeof input.string>;
    routes: ReturnType<typeof input.string>;
    definition: ReturnType<typeof input.optional<string>>;
    themes: ReturnType<typeof input.multiselect<SnapshotTheme>>;
    colorSchemes: ReturnType<typeof input.multiselect<ColorScheme>>;
    viewports: ReturnType<typeof input.multiselect<ViewportName>>;
  },
  { url: string; shots: Array<Shot>; dir: string }
>({
  summary: "Screenshots of a site's pages in each theme, scheme and screen",
  description:
    'Writes PNGs under .site-snapshots/ and changes nothing on the site. The theme is set through the visitor cookie and the scheme through the system preference, so a theme the site does not offer, or a scheme it locks, is reported instead of saved.',
  danger: 'read',
  needs: [],
  inputs: {
    url: input.string({
      prompt: 'Which site?',
      description: 'Where the site is served',
      default: 'http://localhost:3000'
    }),
    // Before the definition, which is only needed when this is not given
    routes: input.string({
      prompt: 'Which routes?',
      description: "Comma-separated paths instead of a definition's pages",
      optional: true,
      flagOnly: true
    }),
    definition: input.optional(
      definitionInput('Take the pages of which definition?'),
      (resolved) => !resolved['routes'],
      'does not apply with --routes'
    ),
    themes: input.multiselect<SnapshotTheme>({
      prompt: 'In which themes?',
      description:
        "Only the ones the site offers are drawn; 'default' is what a first visit shows",
      choices: () =>
        SNAPSHOT_THEMES.map((value) => ({
          value,
          hint: value === 'default' ? 'no theme chosen' : undefined
        })),
      default: [...SNAPSHOT_THEMES],
      min: 1
    }),
    colorSchemes: input.multiselect<ColorScheme>({
      flag: 'schemes',
      prompt: 'In which colour schemes?',
      choices: () => COLOR_SCHEMES.map((value) => ({ value })),
      default: [...COLOR_SCHEMES],
      min: 1
    }),
    viewports: input.multiselect<ViewportName>({
      prompt: 'On which screens?',
      choices: () =>
        VIEWPORT_NAMES.map((value) => ({
          value,
          hint: `${VIEWPORTS[value].width} × ${VIEWPORTS[value].height}`
        })),
      default: [...VIEWPORT_NAMES],
      min: 1
    })
  },

  async plan(
    ctx,
    { url, routes, definition, themes, colorSchemes, viewports }
  ) {
    const paths = await routesFrom(ctx.root, routes, definition);

    await assertAnswers(url);

    const shots = shotsOf(paths, themes, colorSchemes, viewports);
    const dir = join(ctx.root, '.site-snapshots', hostFolder(url), stamp());

    return {
      steps: [
        `${shots.length} screenshot(s) of ${paths.length} route(s) from ${url}`,
        `Into ${relative(ctx.root, dir)}`
      ],
      data: { url, shots, dir }
    };
  },

  async apply(ctx, { url, shots, dir }) {
    mkdirSync(dir, { recursive: true });
    // Only this command needs a browser, so the others never load it
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    const results: Array<ShotResult> = [];

    try {
      const settings = [...new Set(shots.map(settingOf))];

      for (const setting of settings) {
        const group = shots.filter((shot) => settingOf(shot) === setting);
        const [{ theme, colorScheme, viewport }] = group;

        await ctx.ui.task(
          `${theme}, ${colorScheme}, ${viewport}`,
          async () => {
            const context = await browser.newContext({
              viewport: VIEWPORTS[viewport],
              colorScheme
            });
            // No cookie for `default`: that is the visitor who has chosen nothing
            if (theme !== 'default') {
              await context.addCookies([
                { name: THEME_COOKIE, value: theme, url }
              ]);
            }
            const page = await context.newPage();
            let errors: Array<string> = [];
            page.on('console', (message) => {
              if (message.type() === 'error') errors.push(message.text());
            });
            page.on('pageerror', (error) => errors.push(error.message));

            // Settled on the first page: the setting is the same for the rest
            let skipped: SkipReason | undefined;

            for (const shot of group) {
              errors = [];
              if (skipped) {
                results.push({
                  ...shot,
                  path: null,
                  drawnTheme: null,
                  status: null,
                  consoleErrors: [],
                  strips: [],
                  skipped
                });
                continue;
              }

              const response = await page.goto(new URL(shot.route, url).href, {
                waitUntil: 'networkidle',
                timeout: 90_000
              });
              await page.evaluate(() => document.fonts.ready);

              const drawn = await page.evaluate(() => ({
                theme: document.documentElement.getAttribute('data-theme'),
                dark: document.documentElement.classList.contains('dark')
              }));
              if (theme !== 'default' && drawn.theme !== theme) {
                skipped = 'theme-not-offered';
              } else if (drawn.dark !== (colorScheme === 'dark')) {
                skipped = 'scheme-locked';
              }
              if (skipped) {
                results.push({
                  ...shot,
                  path: null,
                  drawnTheme: drawn.theme,
                  status: response?.status() ?? null,
                  consoleErrors: errors,
                  strips: [],
                  skipped
                });
                continue;
              }

              // The sections spanning the page, and the footer, where the
              // browser laid them out: a band nested in another is a panel
              // No named functions in here: the CLI's runner wraps them in a
              // `__name` helper that does not exist in the page
              const layout = await page.evaluate(() => ({
                sections: [...document.querySelectorAll('main [data-band]')]
                  .filter((el) => !el.parentElement?.closest('[data-band]'))
                  .map((el) => ({
                    band: el.getAttribute('data-band') ?? 'none',
                    top: el.getBoundingClientRect().top + scrollY,
                    bottom: el.getBoundingClientRect().bottom + scrollY
                  })),
                footerTop:
                  [...document.querySelectorAll('footer')].map(
                    (el) => el.getBoundingClientRect().top + scrollY
                  )[0] ?? null
              }));
              const strips = findStrips([
                ...layout.sections.map(
                  (section) => ({ kind: 'section', ...section }) as const
                ),
                ...(layout.footerTop === null
                  ? []
                  : [{ kind: 'footer', top: layout.footerTop } as const])
              ]);

              // As tall as the page rather than `fullPage`: the site's sheet is
              // a fixed element, which `fullPage` draws on the first screen only
              const height = await page.evaluate(
                () => document.documentElement.scrollHeight
              );
              await page.setViewportSize({
                width: VIEWPORTS[viewport].width,
                height: Math.max(VIEWPORTS[viewport].height, height)
              });
              const file = join(dir, fileName(shot));
              await page.screenshot({ path: file });
              await page.setViewportSize(VIEWPORTS[viewport]);

              results.push({
                ...shot,
                path: relative(ctx.root, file),
                drawnTheme: drawn.theme,
                status: response?.status() ?? null,
                consoleErrors: errors,
                strips
              });
            }

            await context.close();
          },
          () => {
            const taken = results.filter(
              (result) => settingOf(result) === setting && result.path
            ).length;
            return skipped(results, setting) ?? `${taken} page(s)`;
          }
        );
      }
    } finally {
      await browser.close();
    }

    const taken = results.filter((result) => result.path).length;
    const failing = results.filter(
      (result) => (result.status ?? 0) >= 400 || result.consoleErrors.length
    ).length;
    const stripped = results.filter((result) => result.strips.length).length;

    return {
      summary: `${taken} screenshot(s) in ${relative(ctx.root, dir)}${
        failing
          ? `, ${failing} page(s) with an error status or console errors`
          : ''
      }${
        stripped
          ? `, ${stripped} with a strip of page where bands should meet`
          : ''
      }`,
      json: results
    };
  }
});

/** Why a whole setting was skipped, if it was */
function skipped(
  results: ReadonlyArray<ShotResult>,
  setting: string
): string | undefined {
  const reason = results.find(
    (result) => settingOf(result) === setting && result.skipped
  )?.skipped;
  return reason === 'theme-not-offered'
    ? 'not offered by the site'
    : reason === 'scheme-locked'
      ? 'the site locks its scheme'
      : undefined;
}

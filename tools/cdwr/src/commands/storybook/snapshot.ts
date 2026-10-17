import { existsSync, mkdirSync } from 'fs';
import { join, relative } from 'path';

import { defineCommand } from '../../cli/command';
import { input } from '../../cli/inputs';
import { CommandError, run } from '../../services/shell';
import {
  COLOR_SCHEMES,
  type ColorScheme,
  VIEWPORTS,
  VIEWPORT_NAMES,
  type ViewportName
} from '../../services/snapshot-matrix';

import { serveStatic } from './serve';
import {
  STORYBOOK_THEMES,
  type SbTheme,
  type StoryShot,
  parseStoryIds,
  storyShots,
  storySnapshotName,
  storyUrl
} from './snapshot.logic';

const BUILD_DIR = 'dist/storybook';

/** How long a story may take to draw something */
const RENDER_MS = 15_000;

/** A key per browser setting, so a run of stories shares one context */
const settingOf = ({ theme, colorScheme, viewport }: StoryShot) =>
  `${theme}|${colorScheme}|${viewport}`;

type Source = 'url' | 'static build' | 'will build';

/**
 * Story snapshots, so UI can be looked at without opening Storybook.
 *
 * Each story is drawn on its own page with the toolbar's theme and colour
 * scheme set through the URL, then saved as a PNG for whoever reviews it.
 */
export default defineCommand<
  {
    story: ReturnType<typeof input.string>;
    themes: ReturnType<typeof input.multiselect<SbTheme>>;
    colorSchemes: ReturnType<typeof input.multiselect<ColorScheme>>;
    viewports: ReturnType<typeof input.multiselect<ViewportName>>;
    build: ReturnType<typeof input.boolean>;
    url: ReturnType<typeof input.optional<string>>;
    out: ReturnType<typeof input.string>;
  },
  {
    shots: Array<StoryShot>;
    source: Source;
    url: string | undefined;
    dir: string;
  }
>({
  summary: 'Render Storybook stories to PNG for review',
  description:
    'Writes PNGs under .showcase-images/storybook and changes nothing else. Uses the static build in dist/storybook, building it when missing or with --build, or a running Storybook given with --url.',
  danger: 'read',
  needs: [],
  inputs: {
    story: input.string({
      prompt: 'Which stories?',
      short: 's',
      description: 'Comma-separated story ids, as in the story URL'
    }),
    themes: input.multiselect<SbTheme>({
      prompt: 'In which themes?',
      short: 'T',
      description: "The toolbar's themes",
      choices: () => STORYBOOK_THEMES.map((value) => ({ value })),
      default: ['payload-admin'],
      min: 1
    }),
    colorSchemes: input.multiselect<ColorScheme>({
      flag: 'schemes',
      prompt: 'In which colour schemes?',
      description: 'Colour schemes to draw',
      short: 'c',
      choices: () => COLOR_SCHEMES.map((value) => ({ value })),
      default: [...COLOR_SCHEMES],
      min: 1
    }),
    viewports: input.multiselect<ViewportName>({
      prompt: 'On which screens?',
      description: 'Screen sizes to draw',
      short: 'V',
      choices: () =>
        VIEWPORT_NAMES.map((value) => ({
          value,
          hint: `${VIEWPORTS[value].width} × ${VIEWPORTS[value].height}`
        })),
      default: [...VIEWPORT_NAMES],
      min: 1
    }),
    build: input.boolean({
      prompt: 'Build Storybook first?',
      short: 'b',
      description: `Rebuild ${BUILD_DIR} before drawing`,
      default: false
    }),
    url: input.optional(
      input.string({
        prompt: 'Which Storybook?',
        short: 'u',
        description:
          'Base URL of a running Storybook, instead of the static build',
        flagOnly: true
      }),
      () => false,
      'is a flag only'
    ),
    out: input.string({
      prompt: 'Where to write the images?',
      short: 'o',
      description: 'Output folder, relative to the repository',
      default: '.showcase-images/storybook'
    })
  },

  async plan(ctx, { story, themes, colorSchemes, viewports, build, url, out }) {
    const shots = storyShots(
      parseStoryIds(story),
      themes,
      colorSchemes,
      viewports
    );
    if (url && !/^https?:\/\//.test(url)) {
      throw new Error('--url must start with http:// or https://');
    }
    const built = existsSync(join(ctx.root, BUILD_DIR, 'iframe.html'));
    const source: Source = url
      ? 'url'
      : built && !build
        ? 'static build'
        : 'will build';

    return {
      steps: [
        ...shots.map((shot) => storySnapshotName(shot)),
        source === 'url'
          ? `From the Storybook at ${url}`
          : source === 'static build'
            ? `From the static build in ${BUILD_DIR}`
            : `Build Storybook into ${BUILD_DIR} first`,
        `Into ${out}`
      ],
      data: { shots, source, url, dir: join(ctx.root, out) }
    };
  },

  async apply(ctx, { shots, source, url, dir }) {
    if (source === 'will build') {
      await ctx.ui.task('Building Storybook', async () => {
        try {
          await run('pnpm', ['nx', 'run', 'storybook:build-storybook'], {
            cwd: ctx.root
          });
        } catch (error) {
          if (error instanceof CommandError) {
            const tail = `${error.stdout}\n${error.stderr}`
              .trim()
              .split('\n')
              .slice(-30)
              .join('\n');
            throw new Error(`Storybook did not build:\n${tail}`);
          }
          throw error;
        }
      });
    }

    mkdirSync(dir, { recursive: true });
    const served = url
      ? undefined
      : await serveStatic(join(ctx.root, BUILD_DIR));
    const base = url ?? served?.url ?? '';
    // Only this command needs a browser, so the others never load it
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    const failed: Array<string> = [];
    let taken = 0;

    try {
      for (const setting of new Set(shots.map(settingOf))) {
        const group = shots.filter((shot) => settingOf(shot) === setting);
        const [{ theme, colorScheme, viewport }] = group;
        const context = await browser.newContext({
          viewport: VIEWPORTS[viewport],
          colorScheme,
          deviceScaleFactor: 2
        });

        try {
          const page = await context.newPage();
          for (const shot of group) {
            const file = join(dir, storySnapshotName(shot));
            try {
              await ctx.ui.task(
                storySnapshotName(shot),
                async () => {
                  await page.goto(
                    storyUrl(base, shot.storyId, theme, colorScheme),
                    { waitUntil: 'networkidle' }
                  );
                  await page.waitForFunction(
                    () =>
                      document.querySelector('#storybook-root')
                        ?.firstElementChild != null,
                    undefined,
                    { timeout: RENDER_MS }
                  );
                  await page.waitForTimeout(250);
                  await page.screenshot({ path: file, fullPage: true });
                },
                () => relative(ctx.root, file)
              );
              taken++;
            } catch {
              failed.push(shot.storyId);
            }
          }
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
      served?.server.close();
    }

    ctx.ui.note(`Images are in ${relative(ctx.root, dir)}`);

    if (failed.length) {
      throw new Error(
        `Did not render: ${[...new Set(failed)].join(', ')} (${taken} image(s) taken)`
      );
    }
    return {
      summary: `${taken} image(s) in ${relative(ctx.root, dir)}`,
      json: shots.map((shot) =>
        relative(ctx.root, join(dir, storySnapshotName(shot)))
      )
    };
  }
});

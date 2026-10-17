import type { ColorScheme, ViewportName } from '../../services/snapshot-matrix';

/**
 * The toolbar's themes. Copied from the generated `themes-meta.ts` in the
 * Storybook app, which a tool may not import; the spec compares the two.
 */
export const STORYBOOK_THEMES = [
  'frost',
  'payload-admin',
  'spotlight',
  'codeware',
  'archipelago',
  'midsummer',
  'lingon',
  'granite',
  'aurora',
  'cement'
] as const;
export type SbTheme = (typeof STORYBOOK_THEMES)[number];

/** One story, drawn one way */
export type StoryShot = {
  storyId: string;
  theme: SbTheme;
  colorScheme: ColorScheme;
  viewport: ViewportName;
};

/** The story's own page, with the toolbar globals Storybook applies from the URL */
export const storyUrl = (
  base: string,
  storyId: string,
  theme: SbTheme,
  scheme: ColorScheme
): string =>
  `${base.replace(/\/+$/, '')}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story&globals=theme:${encodeURIComponent(theme)};colorScheme:${encodeURIComponent(scheme)}`;

export const storySnapshotName = ({
  storyId,
  theme,
  colorScheme,
  viewport
}: StoryShot): string => `${storyId}--${theme}-${colorScheme}-${viewport}.png`;

/**
 * Every story in every setting. Theme, scheme and viewport vary slowest
 * because a viewport is a browser context; the story varies fastest because
 * it is only a navigation.
 */
export function storyShots(
  stories: ReadonlyArray<string>,
  themes: ReadonlyArray<SbTheme>,
  schemes: ReadonlyArray<ColorScheme>,
  viewports: ReadonlyArray<ViewportName>
): Array<StoryShot> {
  return themes.flatMap((theme) =>
    schemes.flatMap((colorScheme) =>
      viewports.flatMap((viewport) =>
        stories.map((storyId) => ({ storyId, theme, colorScheme, viewport }))
      )
    )
  );
}

/** Story ids look like `title-path--name`; anything else could escape the output folder */
const STORY_ID = /^[a-z0-9][a-z0-9_-]*$/i;

/** `--story a,b` as a list of unique ids */
export function parseStoryIds(value: string): Array<string> {
  const ids = [
    ...new Set(
      value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    )
  ];
  if (ids.length === 0) {
    throw new Error('Name at least one story id');
  }
  const bad = ids.filter((id) => !STORY_ID.test(id));
  if (bad.length) {
    throw new Error(
      `Not a story id: ${bad.join(', ')}. Ids are lowercase words joined by dashes, like app-cms-dashboard-sitestatssheetbody--empty`
    );
  }
  return ids;
}

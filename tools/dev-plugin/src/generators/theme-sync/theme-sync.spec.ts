import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { describe, expect, it } from 'vitest';

import {
  SITE_THEMES,
  STORYBOOK_THEMES as THEMES,
  THEME_LIB_PATH as THEME_LIB
} from '../themes.js';

import themeSyncGenerator, { validateThemeRegistry } from './theme-sync';

const CORE_PATH = `${THEME_LIB}/_core`;
const OUTPUT_CSS = 'apps/storybook/.storybook/themes.css';
const OUTPUT_META = 'apps/storybook/.storybook/themes-meta.ts';
const OUTPUT_SITE_CSS = `${CORE_PATH}/themes.css`;
const OUTPUT_SITE_THEMES = 'libs/shared/theme/src/lib/site-themes.ts';
const OUTPUT_BUILT_IN_TOKENS = 'libs/shared/theme/src/lib/built-in-tokens.ts';

// Payload's admin convention — valid for a Storybook theme, unsatisfiable for
// a site theme whose name already occupies data-theme
const ATTRIBUTE_DARK_CSS = `[data-theme='dark'] {
  --background: oklch(0.1 0 0);
  --primary: oklch(0.6 0.2 240);
}`;

// Minimal contract: 2 shadcn tokens + 1 prose token (--body)
const TAILWIND_SETUP_CSS = `
@theme inline {
  --color-background: var(--background);
  --color-primary: var(--primary);
}
`;

const TYPOGRAPHY_PROSE_JS = `
module.exports = { '--tw-prose-body': 'var(--body)' };
`;

const COMPLETE_LIGHT_CSS = `:root {
  --background: oklch(1 0 0);
  --primary: oklch(0.5 0.2 240);
  --body: oklch(0.1 0 0);
}`;

// --body is commented out — this is the bug scenario
const COMMENTED_LIGHT_CSS = `:root {
  --background: oklch(1 0 0);
  --primary: oklch(0.5 0.2 240);
  /* --body: oklch(0.1 0 0); */
}`;

const DARK_CSS = `.dark {
  --background: oklch(0.1 0 0);
  --primary: oklch(0.6 0.2 240);
}`;

function setupTree() {
  const tree = createTreeWithEmptyWorkspace();
  tree.write(`${CORE_PATH}/tailwind-setup.css`, TAILWIND_SETUP_CSS);
  tree.write(`${CORE_PATH}/typography-prose.js`, TYPOGRAPHY_PROSE_JS);
  for (const theme of THEMES) {
    tree.write(`${THEME_LIB}/${theme}/tokens-light.css`, COMPLETE_LIGHT_CSS);
    tree.write(`${THEME_LIB}/${theme}/tokens-dark.css`, DARK_CSS);
  }
  tree.write(OUTPUT_CSS, '');
  tree.write(OUTPUT_META, '');
  return tree;
}

describe('theme-sync generator — completeness check', () => {
  it('passes when all required tokens are defined', async () => {
    const tree = setupTree();
    await expect(themeSyncGenerator(tree)).resolves.not.toThrow();
  });

  it('throws when a token is absent from tokens-light.css', async () => {
    const tree = setupTree();
    tree.write(
      `${THEME_LIB}/frost/tokens-light.css`,
      `:root {
  --background: oklch(1 0 0);
  --primary: oklch(0.5 0.2 240);
}`
    );
    await expect(themeSyncGenerator(tree)).rejects.toThrow(
      'frost/tokens-light.css missing'
    );
    await expect(themeSyncGenerator(tree)).rejects.toThrow('--body');
  });

  it('throws when a commented-out token is missing from tokens-light.css', async () => {
    const tree = setupTree();
    tree.write(`${THEME_LIB}/spotlight/tokens-light.css`, COMMENTED_LIGHT_CSS);
    await expect(themeSyncGenerator(tree)).rejects.toThrow(
      'spotlight/tokens-light.css missing'
    );
    await expect(themeSyncGenerator(tree)).rejects.toThrow('--body');
  });

  it('throws when a token is absent from tokens-dark.css', async () => {
    const tree = setupTree();
    tree.write(
      `${THEME_LIB}/frost/tokens-dark.css`,
      `.dark {
  --background: oklch(0.1 0 0);
}`
    );
    await expect(themeSyncGenerator(tree)).rejects.toThrow(
      'frost/tokens-dark.css missing'
    );
    await expect(themeSyncGenerator(tree)).rejects.toThrow('--primary');
  });

  it('throws when a commented-out token is missing from tokens-dark.css', async () => {
    const tree = setupTree();
    tree.write(
      `${THEME_LIB}/frost/tokens-dark.css`,
      `.dark {
  --background: oklch(0.1 0 0);
  /* --primary: oklch(0.6 0.2 240); */
}`
    );
    await expect(themeSyncGenerator(tree)).rejects.toThrow(
      'frost/tokens-dark.css missing'
    );
    await expect(themeSyncGenerator(tree)).rejects.toThrow('--primary');
  });
});

describe('theme-sync generator — site themes', () => {
  it('scopes each site theme to data-theme, light and dark', async () => {
    const tree = setupTree();
    await themeSyncGenerator(tree);

    const css = tree.read(OUTPUT_SITE_CSS, 'utf-8') ?? '';
    for (const theme of SITE_THEMES) {
      expect(css).toContain(`[data-theme='${theme}']`);
      expect(css).toContain(`[data-theme='${theme}'].dark`);
    }
  });

  it('excludes payload-admin from the site stylesheet and registry', async () => {
    const tree = setupTree();
    await themeSyncGenerator(tree);

    expect(tree.read(OUTPUT_SITE_CSS, 'utf-8')).not.toContain('payload-admin');
    expect(tree.read(OUTPUT_SITE_THEMES, 'utf-8')).not.toContain(
      'payload-admin'
    );
  });

  it('emits the site theme registry', async () => {
    const tree = setupTree();
    await themeSyncGenerator(tree);

    // Whitespace-normalised: prettier wraps the array once it grows, and the
    // registry's contents are the point rather than its line breaks
    const registry = (tree.read(OUTPUT_SITE_THEMES, 'utf-8') ?? '').replace(
      /\s+/g,
      ' '
    );
    expect(registry).toContain(
      `export const SITE_THEMES = [ ${SITE_THEMES.map((t) => `'${t}'`).join(', ')} ] as const`
    );
    expect(registry).toContain(
      'export type SiteTheme = (typeof SITE_THEMES)[number]'
    );
  });

  /**
   * The theme studio opens a built-in by fitting a recipe to its tokens, and
   * the source CSS is not on disk in a deployed image. These are what it reads
   * instead, so they have to say exactly what the CSS said.
   */
  describe('built-in tokens', () => {
    it('emits every built-in, not only the site ones', async () => {
      const tree = setupTree();
      await themeSyncGenerator(tree);

      const emitted = tree.read(OUTPUT_BUILT_IN_TOKENS, 'utf-8') ?? '';

      for (const theme of THEMES) {
        expect(emitted).toContain(
          `${theme.includes('-') ? `'${theme}'` : theme}:`
        );
      }
    });

    it('carries the declarations through, per scheme', async () => {
      const tree = setupTree();
      await themeSyncGenerator(tree);

      const emitted = tree.read(OUTPUT_BUILT_IN_TOKENS, 'utf-8') ?? '';

      expect(emitted).toContain("'--body': 'oklch(0.1 0 0)'");
      expect(emitted).toContain("'--primary': 'oklch(0.6 0.2 240)'");
    });

    // Same rule the completeness check follows: a commented-out declaration is
    // prose about a token, not the token
    it('leaves a commented-out declaration out', async () => {
      const tree = setupTree();
      for (const theme of THEMES) {
        tree.write(
          `${THEME_LIB}/${theme}/tokens-light.css`,
          COMMENTED_LIGHT_CSS
        );
      }
      tree.write(`${CORE_PATH}/typography-prose.js`, 'module.exports = {};');

      await themeSyncGenerator(tree);

      expect(tree.read(OUTPUT_BUILT_IN_TOKENS, 'utf-8') ?? '').not.toContain(
        '--body'
      );
    });

    // The mono font stack wraps across lines in every committed theme, and a
    // value read one line at a time would be truncated to its first
    it('collapses a value that wraps across lines', async () => {
      const tree = setupTree();
      tree.write(
        `${THEME_LIB}/frost/tokens-light.css`,
        `:root {
  --background: oklch(1 0 0);
  --primary: oklch(0.5 0.2 240);
  --body: oklch(0.1 0 0);
  --core-font-mono:
    ui-monospace, SFMono-Regular,
    Menlo, monospace;
}`
      );

      await themeSyncGenerator(tree);

      expect(tree.read(OUTPUT_BUILT_IN_TOKENS, 'utf-8') ?? '').toContain(
        "'--core-font-mono': 'ui-monospace, SFMono-Regular, Menlo, monospace'"
      );
    });
  });

  it('leaves the Storybook stylesheet scoped to data-sb-theme', async () => {
    const tree = setupTree();
    await themeSyncGenerator(tree);

    const css = tree.read(OUTPUT_CSS, 'utf-8') ?? '';
    expect(css).toContain("[data-sb-theme='frost']");
    expect(css).toContain("[data-sb-theme='payload-admin']");
    // the site attribute must never leak into the Storybook output
    expect(css).not.toContain("[data-theme='frost']");
  });

  it('throws when a site theme declares dark by attribute', async () => {
    const tree = setupTree();
    tree.write(`${THEME_LIB}/spotlight/tokens-dark.css`, ATTRIBUTE_DARK_CSS);
    await expect(themeSyncGenerator(tree)).rejects.toThrow(
      'unsatisfiable once data-theme carries the theme name'
    );
  });

  it('allows payload-admin to declare dark by attribute', async () => {
    const tree = setupTree();
    tree.write(
      `${THEME_LIB}/payload-admin/tokens-dark.css`,
      ATTRIBUTE_DARK_CSS
    );
    await expect(themeSyncGenerator(tree)).resolves.not.toThrow();
  });
});

describe('theme-sync generator — registry validation', () => {
  it('accepts the shipped lists', () => {
    expect(() => validateThemeRegistry(THEMES, SITE_THEMES)).not.toThrow();
  });

  it('rejects a theme named light or dark', () => {
    expect(() =>
      validateThemeRegistry([...THEMES, 'dark'], SITE_THEMES)
    ).toThrow('reserved');
  });

  it('rejects a site theme absent from the Storybook list', () => {
    expect(() => validateThemeRegistry(THEMES, ['brand-new'])).toThrow(
      'missing from STORYBOOK_THEMES'
    );
  });
});

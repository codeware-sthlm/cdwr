import { mkdtempSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { THEME_LIB_PATH as THEME_LIB } from '../themes.js';

import { themeWriteGenerator } from './theme-write';

const LIGHT = ':root {\n  --background: oklch(1 0 0);\n}\n';
const DARK = '.dark {\n  --background: oklch(0.1 0 0);\n}\n';
const BASE = "/* hand-written */\n@import './tokens-light.css';\n";

let dir: string;

/** Write a studio payload to a real path — the generator reads from disk. */
const payload = (body: unknown): string => {
  const path = join(dir, `${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(path, typeof body === 'string' ? body : JSON.stringify(body));
  return path;
};

const theme = (name: string) => ({
  name,
  files: {
    'tokens-light.css': ':root {\n  --background: oklch(0.5 0 0);\n}\n',
    'tokens-dark.css': '.dark {\n  --background: oklch(0.2 0 0);\n}\n'
  }
});

function setupTree() {
  const tree = createTreeWithEmptyWorkspace();
  for (const name of ['frost', 'spotlight', 'codeware']) {
    tree.write(`${THEME_LIB}/${name}/tokens-light.css`, LIGHT);
    tree.write(`${THEME_LIB}/${name}/tokens-dark.css`, DARK);
    tree.write(`${THEME_LIB}/${name}/tailwind-base.css`, BASE);
  }
  return tree;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'theme-write-'));
});

describe('theme-write generator', () => {
  it('replaces both token files of an existing theme', async () => {
    const tree = setupTree();
    await themeWriteGenerator(tree, { from: payload(theme('codeware')) });

    expect(
      tree.read(`${THEME_LIB}/codeware/tokens-light.css`, 'utf-8')
    ).toContain('oklch(0.5 0 0)');
    expect(
      tree.read(`${THEME_LIB}/codeware/tokens-dark.css`, 'utf-8')
    ).toContain('oklch(0.2 0 0)');
  });

  /**
   * The studio generates a fixed `tailwind-base.css`. Writing it back would
   * delete `codeware`'s hand-written `@theme inline` brand block, and the theme
   * would still compile — the loss would only show up as missing colours.
   */
  it('never touches tailwind-base.css', async () => {
    const tree = setupTree();
    await themeWriteGenerator(tree, {
      from: payload({
        ...theme('codeware'),
        files: {
          ...theme('codeware').files,
          'tailwind-base.css': '/* generated, would clobber */'
        }
      })
    });

    expect(tree.read(`${THEME_LIB}/codeware/tailwind-base.css`, 'utf-8')).toBe(
      BASE
    );
  });

  it.each([['frost', 'baseline']])('refuses %s', async (name, because) => {
    const tree = setupTree();

    await expect(
      themeWriteGenerator(tree, { from: payload(theme(name)) })
    ).rejects.toThrow(because);

    // and leaves it exactly as it was
    expect(tree.read(`${THEME_LIB}/${name}/tokens-light.css`, 'utf-8')).toBe(
      LIGHT
    );
  });

  it('refuses a theme that does not exist', async () => {
    const tree = setupTree();

    await expect(
      themeWriteGenerator(tree, { from: payload(theme('not-a-theme')) })
    ).rejects.toThrow(/No theme called 'not-a-theme'/);
  });

  it.each([
    [
      'a missing file',
      { name: 'codeware', files: { 'tokens-light.css': ':root{}' } }
    ],
    [
      'an empty file',
      {
        name: 'codeware',
        files: { 'tokens-light.css': '', 'tokens-dark.css': '.dark{}' }
      }
    ],
    ['no name', { files: theme('codeware').files }],
    ['no files at all', { name: 'codeware' }]
  ])('refuses a payload with %s', async (_label, body) => {
    const tree = setupTree();

    await expect(
      themeWriteGenerator(tree, { from: payload(body) })
    ).rejects.toThrow();
  });

  // The studio prints `--from=~/Downloads/…`, and a shell does not always
  // expand a tilde inside an `--opt=value` argument
  it('expands a leading tilde', async () => {
    const tree = setupTree();
    const abs = payload(theme('codeware'));
    const home = homedir();

    // Only meaningful when the temp dir is under $HOME; skip elsewhere
    if (!abs.startsWith(home)) {
      return;
    }

    await expect(
      themeWriteGenerator(tree, { from: `~${abs.slice(home.length)}` })
    ).resolves.not.toThrow();
  });

  it('says where it looked when the file is not there', async () => {
    const tree = setupTree();

    await expect(
      themeWriteGenerator(tree, { from: '~/definitely-not-here.json' })
    ).rejects.toThrow(/no such file/);
  });

  it('refuses a path that is not JSON', async () => {
    const tree = setupTree();

    await expect(
      themeWriteGenerator(tree, { from: payload('not json at all') })
    ).rejects.toThrow(/is not JSON/);

    await expect(
      themeWriteGenerator(tree, { from: join(dir, 'nothing-here.json') })
    ).rejects.toThrow(/Could not read/);
  });

  // Writing identical content would still dirty the working tree through
  // prettier's own reformatting, and report a change that is not one
  it('writes nothing when the theme already matches', async () => {
    const tree = setupTree();
    const from = payload(theme('codeware'));

    await themeWriteGenerator(tree, { from });
    const after = tree.read(`${THEME_LIB}/codeware/tokens-light.css`, 'utf-8');

    tree.listChanges().length = 0;
    await themeWriteGenerator(tree, { from });

    expect(tree.read(`${THEME_LIB}/codeware/tokens-light.css`, 'utf-8')).toBe(
      after
    );
  });
});

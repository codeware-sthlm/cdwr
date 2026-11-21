import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

import { customTranslations } from '@codeware/app-cms/util/i18n';

/**
 * Every custom translation key is referenced as a literal `group:key` in source
 * that ships; specs and stories don't count.
 *
 * A key nothing references still ships in both languages and needs
 * translating, so it is removed rather than kept.
 */

/** Keys kept on purpose without a literal reference: built at runtime, or overriding a Payload string */
const allowlist = new Set<string>();

const workspaceRoot = resolve(__dirname, '../../..');

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const skippedDirs = new Set(['node_modules', 'dist', 'coverage']);
const i18nLib = join(workspaceRoot, 'libs/app-cms/util/i18n');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name.startsWith('.') ||
        skippedDirs.has(entry.name) ||
        path === i18nLib
        ? []
        : sourceFiles(path);
    }
    return /\.(m?[jt]s|[jt]sx)$/.test(entry.name) &&
      !/\.(spec|test|stories)\.[^.]+$/.test(entry.name)
      ? [path]
      : [];
  });

describe('custom translations', () => {
  it('has no key without a reference', () => {
    const source = ['apps', 'libs']
      .flatMap((root) => sourceFiles(join(workspaceRoot, root)))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    const unreferenced = Object.entries(customTranslations.en)
      .flatMap(([group, keys]) =>
        Object.keys(keys).map((key) => `${group}:${key}`)
      )
      // Bounded on both sides, so `group:waiting` isn't found inside `group:waitingCount`
      .filter(
        (key) =>
          !allowlist.has(key) &&
          !new RegExp(`(?<![\\w:])${escape(key)}(?![\\w])`).test(source)
      );

    expect(unreferenced).toEqual([]);
  });
});

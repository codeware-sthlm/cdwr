import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { UsageError } from '../cli/errors';

import {
  DEFINITIONS_DIR,
  listSiteDefinitions,
  resolveDefinition
} from './site-definitions';

const root = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..'
);

/**
 * Run against the real directory rather than a fixture. What this has to prove
 * is that the definitions in the repository load and describe themselves — a
 * mocked filesystem would pass while the picker showed seven unreadable paths.
 */
describe('listSiteDefinitions', () => {
  it('finds the definitions and reads what each calls itself', async () => {
    const entries = await listSiteDefinitions(root);
    const cdwrIo = entries.find(({ path }) => path.endsWith('cdwr-io.ts'));

    expect(cdwrIo?.name).toBe('cdwr.io');
    expect(cdwrIo?.description).toBeTruthy();
  });

  it('leaves the spec files out, which are not definitions', async () => {
    const entries = await listSiteDefinitions(root);

    expect(entries.every(({ path }) => !path.endsWith('.spec.ts'))).toBe(true);
  });

  it('offers a path for every definition it lists', async () => {
    const entries = await listSiteDefinitions(root);

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every(({ path }) => path.endsWith('.ts'))).toBe(true);
  });
});

/** A throwaway workspace root with a definitions directory */
describe('with a fixture workspace', () => {
  let tmp: string;
  let dir: string;

  const write = (file: string, content: string) =>
    writeFileSync(join(dir, file), content);

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'site-definitions-'));
    dir = join(tmp, DEFINITIONS_DIR);
    mkdirSync(dir, { recursive: true });

    write('alpha.ts', "export default { name: 'alpha.site', pages: [] };");
    write('beta.ts', "export default { name: 'shared', pages: [] };");
    write('gamma.ts', "export default { name: 'shared', pages: [] };");
    write('helper.ts', 'export default { icons: [] };');
    write('broken.ts', "throw new Error('does not load');");
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  const failure = async (value: string): Promise<UsageError> => {
    const error = await resolveDefinition(tmp, value).catch((e) => e);
    expect(error).toBeInstanceOf(UsageError);
    return error as UsageError;
  };

  describe('listSiteDefinitions', () => {
    it('drops a helper module and keeps one that fails to load', async () => {
      const entries = await listSiteDefinitions(tmp);

      expect(entries.map(({ path }) => path.split('/').pop())).toEqual([
        'alpha.ts',
        'beta.ts',
        'broken.ts',
        'gamma.ts'
      ]);
      expect(entries.find(({ path }) => path.endsWith('broken.ts'))?.name).toBe(
        undefined
      );
    });
  });

  describe('resolveDefinition', () => {
    it('finds a definition by file name, with or without .ts', async () => {
      const expected = join(tmp, DEFINITIONS_DIR, 'alpha.ts');

      expect(await resolveDefinition(tmp, 'alpha')).toBe(expected);
      expect(await resolveDefinition(tmp, 'alpha.ts')).toBe(expected);
    });

    it('finds a definition by a site name only one goes by', async () => {
      expect(await resolveDefinition(tmp, 'alpha.site')).toBe(
        join(tmp, DEFINITIONS_DIR, 'alpha.ts')
      );
    });

    it('resolves an existing path from the root, or as absolute', async () => {
      const relative = join(DEFINITIONS_DIR, 'beta.ts');

      expect(await resolveDefinition(tmp, relative)).toBe(join(tmp, relative));
      expect(await resolveDefinition(tmp, join(tmp, relative))).toBe(
        join(tmp, relative)
      );
    });

    it('fails on a path that does not exist', async () => {
      const error = await failure('nowhere/site.ts');

      expect(error.message).toContain(join(tmp, 'nowhere/site.ts'));
    });

    it('lists the available definitions when the name is unknown', async () => {
      const error = await failure('missing');

      expect(error.message).toContain('missing');
      expect(error.hint).toContain('alpha (alpha.site)');
      expect(error.hint).toContain('broken');
      expect(error.hint).not.toContain('helper');
    });

    it('names the candidates when a site name is ambiguous', async () => {
      const error = await failure('shared');

      expect(error.message).toContain('shared');
      expect(error.hint).toContain('beta');
      expect(error.hint).toContain('gamma');
    });
  });
});

describe('resolveDefinition against the repository', () => {
  it('finds the repository definition by file name or site name', async () => {
    const expected = join(root, DEFINITIONS_DIR, 'cdwr-io.ts');

    expect(await resolveDefinition(root, 'cdwr-io')).toBe(expected);
    expect(await resolveDefinition(root, 'cdwr.io')).toBe(expected);
  });
});

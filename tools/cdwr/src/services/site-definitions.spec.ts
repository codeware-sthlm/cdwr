import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { listSiteDefinitions, resolveDefinitionPath } from './site-definitions';

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

describe('resolveDefinitionPath', () => {
  it('resolves a repository path against the workspace root', () => {
    expect(resolveDefinitionPath('/repo', 'libs/a/b.ts')).toBe(
      '/repo/libs/a/b.ts'
    );
  });

  it('leaves an absolute path alone, so a definition can live anywhere', () => {
    expect(resolveDefinitionPath('/repo', '/elsewhere/b.ts')).toBe(
      '/elsewhere/b.ts'
    );
  });
});

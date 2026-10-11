import { ignoredFiles, isIgnoredFile } from './ignored-files';

describe('isIgnoredFile', () => {
  it.each([
    'apps/cms/CLAUDE.md',
    'README.md',
    'docs/x.mdx',
    '.claude/skills/x/SKILL.md',
    'libs/a/src/b.spec.ts',
    'libs/a/src/b.test.tsx',
    'libs/ui/src/x.stories.tsx',
    'apps/web/__snapshots__/a.snap',
    'libs/a/src/test-setup.ts'
  ])('ignores %s', (path) => {
    expect(isIgnoredFile(path)).toBe(true);
  });

  it.each([
    'apps/cms/src/x.ts',
    'pnpm-lock.yaml',
    'nx.json',
    'apps/cms/specs.ts',
    'libs/a/src/inspect.ts'
  ])('keeps %s', (path) => {
    expect(isIgnoredFile(path)).toBe(false);
  });

  it('lists the patterns', () => {
    expect(ignoredFiles).toHaveLength(7);
  });
});

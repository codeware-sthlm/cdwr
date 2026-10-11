import { matchesGlob } from './glob';

describe('matchesGlob', () => {
  it.each([
    // [path, pattern, expected]
    ['README.md', '**/*.md', true],
    ['docs/a/b.md', '**/*.md', true],
    ['docs/a/b.mdx', '**/*.md', false],
    ['a.md.ts', '**/*.md', false],
    ['.claude/skills/x/SKILL.md', '.claude/**', true],
    ['x/.claude/a', '.claude/**', false],
    ['.claudex/a', '.claude/**', false],
    ['a/b.spec.ts', '**/*.{spec,test}.*', true],
    ['a/b.test.tsx', '**/*.{spec,test}.*', true],
    ['a/b.other.ts', '**/*.{spec,test}.*', false],
    ['src/a.ts', 'src/*.ts', true],
    ['src/deep/a.ts', 'src/*.ts', false],
    ['aXb', 'a.b', false],
    ['a.b', 'a.b', true],
    ['a(b)', 'a(b)', true]
  ])('%s against %s is %s', (path, pattern, expected) => {
    expect(matchesGlob(path, pattern)).toBe(expected);
  });
});

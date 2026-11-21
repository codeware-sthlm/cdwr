import { maxPathLength, parseLoadDocInput, resolveDocPath } from './doc-path';

describe('resolveDocPath', () => {
  it.each([
    ['about', { collection: undefined, slug: 'about' }],
    ['about/', { collection: undefined, slug: 'about' }],
    ['legal/privacy', { collection: undefined, slug: 'legal/privacy' }],
    ['posts/hello', { collection: 'posts', slug: 'hello' }],
    ['tours/alps', { collection: 'tours', slug: 'alps' }],
    ['posts/a/b', { collection: 'posts', slug: 'a/b' }]
  ])('%s', (path, expected) => {
    expect(resolveDocPath(path)).toEqual(expected);
  });

  it('treats a bare collection segment as a page slug', () => {
    expect(resolveDocPath('posts')).toEqual({
      collection: undefined,
      slug: 'posts'
    });
  });

  it.each([
    'about#',
    'about&depth=1',
    'a b',
    '..',
    'posts/../x',
    'About',
    'a?b',
    'a'.repeat(513)
  ])('refuses %j without a lookup', (path) => {
    expect(resolveDocPath(path)).toBeNull();
  });

  it.each([undefined, '', '/'])('has nothing to look up for %j', (path) => {
    expect(resolveDocPath(path)).toBeNull();
  });
});

describe('parseLoadDocInput', () => {
  it('keeps a plain input', () => {
    expect(parseLoadDocInput({ splat: 'about', locale: 'sv' })).toEqual({
      splat: 'about',
      locale: 'sv'
    });
  });

  it.each([null, undefined, 'x', 1, {}, { splat: 1, locale: 2 }])(
    'turns %j into an empty lookup',
    (input) => {
      expect(parseLoadDocInput(input)).toEqual({ splat: '', locale: 'en' });
    }
  );

  it('drops an over-long path', () => {
    expect(
      parseLoadDocInput({ splat: 'a'.repeat(maxPathLength + 1), locale: 'en' })
        .splat
    ).toBe('');
  });
});

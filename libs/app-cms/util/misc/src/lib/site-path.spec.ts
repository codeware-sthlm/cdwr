import { sitePath } from './site-path';

describe('sitePath', () => {
  it('serves a page at the root level', () => {
    expect(sitePath('pages', { id: 2, slug: 'om' }, 1)).toBe('/om');
    expect(sitePath('pages', { id: 2, slug: 'om/oss' })).toBe('/om/oss');
  });

  it('serves the landing page at the root', () => {
    expect(sitePath('pages', { id: 1, slug: 'hem' }, 1)).toBe('/');
  });

  it('serves posts and tours under their collection', () => {
    expect(sitePath('posts', { id: 1, slug: 'nyhet' }, 1)).toBe('/posts/nyhet');
    expect(sitePath('tours', { slug: 'a/b' })).toBe('/tours/a/b');
  });

  it('falls back to the collection root without a slug', () => {
    expect(sitePath('pages', {})).toBe('/');
    expect(sitePath('posts', { slug: null })).toBe('/posts');
  });
});

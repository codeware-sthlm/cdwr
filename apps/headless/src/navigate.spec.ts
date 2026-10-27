import { isClientPath } from './navigate';

describe('isClientPath', () => {
  it.each(['/', '/about', '/posts/hello?x=1', '/about#top', '/administrators'])(
    'navigates %s in the app',
    (path) => {
      expect(isClientPath(path)).toBe(true);
    }
  );

  it.each([
    'https://example.com',
    '//example.com',
    'about',
    '/admin',
    '/admin/collections',
    '/api/health',
    '/admin?x=1'
  ])('loads %s as a document', (path) => {
    expect(isClientPath(path)).toBe(false);
  });
});

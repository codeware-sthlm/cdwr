/** @jest-environment node */
import { readdirSync } from 'fs';
import { join, relative, resolve, sep } from 'path';

import { isUnroutableSitePath } from './unroutable-path';

const appRoot = resolve(__dirname, '..', '..');
const appDir = join(appRoot, 'src/app');
const publicDir = join(appRoot, 'public');

/** Metadata files Next generates from code, by the name they are served at */
const METADATA_ROUTES: Record<string, string> = {
  robots: 'robots.txt',
  sitemap: 'sitemap.xml',
  manifest: 'manifest.webmanifest'
};

/** Files in `src/app` that are source, not served under their own name */
const SOURCE = /\.(ts|tsx|js|jsx|mjs|css|md|mdx)$/;

/** Every file under a directory, as paths relative to it */
const filesIn = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)));

/** The url path of an app file's folder, without route groups */
const routeOf = (segments: string[]) =>
  `/${segments.filter((segment) => !/^\(.*\)$/.test(segment)).join('/')}`;

/** Dotted paths the app's own routes serve, read from `src/app` */
const appPaths = [
  ...new Set(
    filesIn(appDir).flatMap((file) => {
      const segments = file.split(sep);
      const name = segments.pop() ?? '';
      const paths: string[] = [];

      // A route folder named like a file, such as `og-image.png/route.tsx`
      const dotted = segments.findIndex(
        (segment) => segment.includes('.') && !segment.startsWith('[')
      );
      if (dotted >= 0) {
        paths.push(routeOf(segments.slice(0, dotted + 1)));
      }

      // A static file such as `icon.png` or `manifest.json` is served as is
      if (!SOURCE.test(name)) {
        paths.push(routeOf([...segments, name]));
      }

      const metadata = METADATA_ROUTES[name.replace(/\.[^.]+$/, '')];
      if (metadata && /\.(ts|tsx|js)$/.test(name)) {
        paths.push(routeOf([...segments, metadata]));
      }

      return paths;
    })
  )
];

/** Files `public/` serves, without dotfiles such as `.gitkeep` */
const publicPaths = filesIn(publicDir)
  .filter((file) => !file.split(sep).some((part) => part.startsWith('.')))
  .map((file) => `/${file.split(sep).join('/')}`);

describe('isUnroutableSitePath', () => {
  it.each([
    '/.env',
    '/.netrc',
    '/.npmrc',
    '/wp-config.php',
    '/wp-config.txt',
    '/secrets.yaml',
    '/storage/logs/laravel.log',
    '/posts/x.php',
    '/tours/a/b.json',
    '/%2eenv',
    '/robots.txt/',
    '/blocks/x.php'
  ])('refuses %s', (path) => {
    expect(isUnroutableSitePath(path)).toBe(true);
  });

  it.each([
    '/',
    '/about',
    '/posts/my-post',
    '/tours/a/b',
    '/api/media/file/a.png',
    '/api',
    '/admin/collections/pages',
    '/_next/data/x.json',
    '/__nextjs_font/inter-latin.woff2',
    '/stats/script.js',
    '/monitoring',
    '/.well-known/security.txt',
    '/robots.txt',
    '/sitemap.xml',
    '/favicon.ico'
  ])('passes %s on', (path) => {
    expect(isUnroutableSitePath(path)).toBe(false);
  });

  it('reads the dotted routes and public files from disk', () => {
    expect(appPaths).toEqual(
      expect.arrayContaining(['/robots.txt', '/sitemap.xml', '/og-image.png'])
    );
    expect(publicPaths).toEqual(
      expect.arrayContaining(['/favicon.ico', '/cdwr-cloud.png'])
    );
  });

  it.each([...appPaths, ...publicPaths])('serves %s', (path) => {
    expect(isUnroutableSitePath(path)).toBe(false);
  });
});

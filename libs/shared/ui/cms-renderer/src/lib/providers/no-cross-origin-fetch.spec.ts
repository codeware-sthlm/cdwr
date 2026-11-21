import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The browser never calls the cms api.
 *
 * Every client-side request goes to a route on the app's own origin, which
 * then reaches Payload server-side with the tenant api key. Two properties
 * rest on that, and both fail silently if it is broken:
 *
 * - **The api key stays on the server.** A browser call would have to carry it.
 * - **A tenant's custom domain is never a cors origin.** Adding a domain
 *   therefore needs no cors configuration anywhere — which is why the cms api
 *   can stay closed rather than being opened to `*`.
 *
 * `payloadUrl` in client code is fine for asset urls (`img`, `video`, download
 * links) — those are not cors-restricted. It is a `fetch` to it that is not.
 */

const workspaceRoot = resolve(__dirname, '../../../../../../..');

/** Everything that ships code to a browser and can see `payloadUrl` */
const clientRoots = [
  join(workspaceRoot, 'libs/shared/ui/cms-renderer/src'),
  join(workspaceRoot, 'apps/cms/src/app/(site)')
];

/**
 * A `fetch` whose url literal does not start with `/`.
 *
 * Keying on the destination rather than on a variable name: the same mistake
 * reads `${payloadUrl}/api/…` in one app and `${env.PAYLOAD_URL}/api/…` in
 * another, and an absolute `https://…` in a third. What they share is that the
 * url is not same-origin. A relative path always is.
 *
 * This is a tripwire for the shape, not a proof — `fetch(url)` built elsewhere
 * cannot be seen statically. It catches the way the mistake actually gets
 * written, which is what a guard is for.
 */
const NON_RELATIVE_FETCH = /fetch\(\s*[`'"](?!\/)/;

const sourceFiles = (root: string): Array<string> => {
  let entries: Array<{ isDirectory: () => boolean; name: string }>;

  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    // A root that has moved should fail the "roots exist" test below rather
    // than quietly shrinking this one's coverage to nothing
    return [];
  }

  return entries.flatMap((entry) => {
    const path = join(root, entry.name);

    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : sourceFiles(path);
    }

    return /\.tsx?$/.test(entry.name) && !/\.spec\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
};

describe('browser code never fetches the cms api', () => {
  it('finds the client source roots', () => {
    for (const root of clientRoots) {
      expect(sourceFiles(root).length).toBeGreaterThan(0);
    }
  });

  it('has no fetch to an absolute url', () => {
    const offenders = clientRoots
      .flatMap(sourceFiles)
      .filter((file) => NON_RELATIVE_FETCH.test(readFileSync(file, 'utf8')))
      .map((file) => file.replace(`${workspaceRoot}/`, ''));

    expect(offenders).toEqual([]);
  });
});

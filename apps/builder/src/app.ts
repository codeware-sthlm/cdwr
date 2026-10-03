import { createHash, timingSafeEqual } from 'node:crypto';

import type { ComponentBuildInput } from '@codeware/app-cms/feature/component-builder';
import {
  type ComponentBuildResult,
  parseComponentSource
} from '@codeware/shared/util/payload-utils';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

/** Room for the largest accepted source in any encoding, plus the props */
const MAX_BODY_BYTES = 2_000_000;

export type BuildHandler = (
  input: ComponentBuildInput
) => Promise<ComponentBuildResult>;

export type AppOptions = {
  /** Bearer token a build request must carry; without one every build is refused */
  token: string | null;
  build: BuildHandler;
  /** Requests in flight, queued or running, before new ones are turned away */
  maxPending?: number;
  /** How long a request may wait for its result before it is given up on */
  deadlineMs?: number;
};

/** Builds run one at a time, so a few waiting is a burst; more is a backlog */
const DEFAULT_MAX_PENDING = 4;

/** Longer than the cms waits, so the cms gives up first and this is the backstop */
const DEFAULT_DEADLINE_MS = 90_000;

const afterDeadline = (ms: number): Promise<never> =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new DeadlineError()), ms).unref()
  );

class DeadlineError extends Error {}

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Compares the header's bearer token with the expected one in constant time. */
const isAuthorized = (
  header: string | undefined,
  token: string | null
): boolean => {
  if (token === null) {
    return false;
  }
  const presented = header?.startsWith('Bearer ') ? header.slice(7) : '';
  // Equal-length digests, so the comparison does not leak the token's length
  return timingSafeEqual(digest(presented), digest(token)) && presented !== '';
};

const failure = (message: string): ComponentBuildResult => ({
  ok: false,
  diagnostics: [{ message, line: 1, column: 1, severity: 'error' }]
});

export const createApp = ({
  token,
  build,
  maxPending = DEFAULT_MAX_PENDING,
  deadlineMs = DEFAULT_DEADLINE_MS
}: AppOptions) => {
  const app = new Hono();
  let pending = 0;

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.post(
    '/build',
    async (c, next) => {
      if (token === null) {
        return c.json(
          { error: 'The build service has no token configured.' },
          503
        );
      }
      return isAuthorized(c.req.header('authorization'), token)
        ? next()
        : c.json({ error: 'Unauthorized' }, 401);
    },
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: 'The body is too large.' }, 413)
    }),
    async (c) => {
      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        return c.json({ error: 'The body is not valid JSON.' }, 400);
      }

      const parsed = parseComponentSource(raw);
      if (typeof parsed === 'string') {
        return c.json({ error: parsed }, 400);
      }
      const tagName =
        typeof raw === 'object' && raw !== null && 'tagName' in raw
          ? raw.tagName
          : undefined;
      if (typeof tagName !== 'string' || tagName === '') {
        return c.json({ error: 'The body needs a `tagName` string.' }, 400);
      }

      if (pending >= maxPending) {
        return c.json({ error: 'The build service is busy, try again.' }, 503);
      }

      // A caller that gave up still has its build run to completion: a build
      // cannot be cut short in this process. The cap above is what keeps a
      // burst of such builds from piling up
      pending += 1;
      try {
        return c.json(
          await Promise.race([
            build({ ...parsed, tagName }),
            afterDeadline(deadlineMs)
          ])
        );
      } catch (error) {
        if (error instanceof DeadlineError) {
          return c.json(failure('The build did not finish in time.'), 504);
        }
        console.error('[builder] The build failed unexpectedly', error);
        return c.json(
          failure(
            `The build failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`
          ),
          500
        );
      } finally {
        pending -= 1;
      }
    }
  );

  return app;
};

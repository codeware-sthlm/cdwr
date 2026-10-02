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
  /** Bearer token a build request must carry */
  token: string;
  build: BuildHandler;
};

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Compares the header's bearer token with the expected one in constant time. */
const isAuthorized = (header: string | undefined, token: string): boolean => {
  const presented = header?.startsWith('Bearer ') ? header.slice(7) : '';
  // Equal-length digests, so the comparison does not leak the token's length
  return timingSafeEqual(digest(presented), digest(token)) && presented !== '';
};

const failure = (message: string): ComponentBuildResult => ({
  ok: false,
  diagnostics: [{ message, line: 1, column: 1, severity: 'error' }]
});

export const createApp = ({ token, build }: AppOptions) => {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.post(
    '/build',
    async (c, next) =>
      isAuthorized(c.req.header('authorization'), token)
        ? next()
        : c.json({ error: 'Unauthorized' }, 401),
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

      try {
        return c.json(await build({ ...parsed, tagName }));
      } catch (error) {
        console.error(
          '[component-builder] The build failed unexpectedly',
          error
        );
        return c.json(
          failure(
            `The build failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`
          ),
          500
        );
      }
    }
  );

  return app;
};

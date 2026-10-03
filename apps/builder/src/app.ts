import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

import type { ComponentBuildInput } from '@codeware/app-cms/feature/component-builder';
import {
  type ComponentBuildResult,
  parseComponentSource
} from '@codeware/shared/util/payload-utils';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { type Logger, createLogger, errorFields } from './logger';

/** Room for the largest accepted source in any encoding, plus the props */
const MAX_BODY_BYTES = 2_000_000;

export type BuildHandler = (
  input: ComponentBuildInput
) => Promise<ComponentBuildResult>;

export type AppOptions = {
  /**
   * Bearer tokens a build request may carry (the active one, and the previous
   * one during a rollover); with none every build is refused
   */
  tokens: readonly string[];
  build: BuildHandler;
  /** Requests in flight, queued or running, before new ones are turned away */
  maxPending?: number;
  /** How long a request may wait for its result before it is given up on */
  deadlineMs?: number;
  /** Where the outcome lines go; defaults to JSON lines on stdout/stderr */
  logger?: Logger;
};

type Env = { Variables: { requestId: string } };

const REQUEST_ID_HEADER = 'x-request-id';

/** A caller's id is kept when it is short and plain, so a log line stays one line */
const REQUEST_ID_PATTERN = /^[\w.:-]{1,128}$/;

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

/** Compares the header's bearer token with each accepted one in constant time. */
const isAuthorized = (
  header: string | undefined,
  tokens: readonly string[]
): boolean => {
  const presented = header?.startsWith('Bearer ') ? header.slice(7) : '';
  // Equal-length digests, so the comparison does not leak the token's length;
  // every token is compared, so a match does not show in the timing either
  const matches = tokens.map((token) =>
    timingSafeEqual(digest(presented), digest(token))
  );
  return matches.includes(true) && presented !== '';
};

const failure = (message: string): ComponentBuildResult => ({
  ok: false,
  diagnostics: [{ message, line: 1, column: 1, severity: 'error' }]
});

const countBySeverity = (
  diagnostics: ComponentBuildResult['diagnostics'],
  severity: 'error' | 'warning'
) => diagnostics.filter((d) => d.severity === severity).length;

const describeResult = (result: ComponentBuildResult) =>
  result.ok
    ? {
        ok: true,
        jsBytes: Buffer.byteLength(result.js),
        cssBytes: Buffer.byteLength(result.css),
        errors: countBySeverity(result.diagnostics, 'error'),
        warnings: countBySeverity(result.diagnostics, 'warning'),
        props: result.props?.length
      }
    : {
        ok: false,
        errors: countBySeverity(result.diagnostics, 'error'),
        warnings: countBySeverity(result.diagnostics, 'warning')
      };

export const createApp = ({
  tokens,
  build,
  maxPending = DEFAULT_MAX_PENDING,
  deadlineMs = DEFAULT_DEADLINE_MS,
  logger = createLogger()
}: AppOptions) => {
  const app = new Hono<Env>();
  let pending = 0;

  app.use(async (c, next) => {
    const presented = c.req.header(REQUEST_ID_HEADER);
    const requestId =
      presented !== undefined && REQUEST_ID_PATTERN.test(presented)
        ? presented
        : randomUUID();
    c.set('requestId', requestId);
    c.header(REQUEST_ID_HEADER, requestId);
    await next();
  });

  // Never given the token or the source, only the status and the reason
  const refuse = (
    c: Context<Env>,
    status: 400 | 401 | 413 | 503,
    error: string
  ) => {
    logger.warn('build refused', {
      requestId: c.get('requestId'),
      status,
      reason: error
    });
    return c.json({ error }, status);
  };

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.post(
    '/build',
    async (c, next) => {
      if (tokens.length === 0) {
        return refuse(c, 503, 'The build service has no token configured.');
      }
      return isAuthorized(c.req.header('authorization'), tokens)
        ? next()
        : refuse(c, 401, 'Unauthorized');
    },
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => refuse(c, 413, 'The body is too large.')
    }),
    async (c) => {
      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        return refuse(c, 400, 'The body is not valid JSON.');
      }

      const parsed = parseComponentSource(raw);
      if (typeof parsed === 'string') {
        return refuse(c, 400, parsed);
      }
      const tagName =
        typeof raw === 'object' && raw !== null && 'tagName' in raw
          ? raw.tagName
          : undefined;
      if (typeof tagName !== 'string' || tagName === '') {
        return refuse(c, 400, 'The body needs a `tagName` string.');
      }

      const requestId = c.get('requestId');
      logger.info('build received', {
        requestId,
        tagName,
        sourceLength: parsed.source.length,
        inputs: parsed.propsSchema?.length ?? 0
      });

      if (pending >= maxPending) {
        return refuse(c, 503, 'The build service is busy, try again.');
      }

      // A caller that gave up still has its build run to completion: a build
      // cannot be cut short in this process. The cap above is what keeps a
      // burst of such builds from piling up
      pending += 1;
      const started = Date.now();
      try {
        const result = await Promise.race([
          build({ ...parsed, tagName }),
          afterDeadline(deadlineMs)
        ]);
        logger.info('build finished', {
          requestId,
          durationMs: Date.now() - started,
          ...describeResult(result)
        });
        return c.json(result);
      } catch (error) {
        if (error instanceof DeadlineError) {
          logger.warn('build refused', {
            requestId,
            status: 504,
            reason: 'The build did not finish in time.',
            durationMs: Date.now() - started
          });
          return c.json(failure('The build did not finish in time.'), 504);
        }
        logger.error('build failed unexpectedly', {
          requestId,
          ...errorFields(error)
        });
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

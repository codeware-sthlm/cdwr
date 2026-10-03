import type { ComponentBuildResult } from '@codeware/shared/util/payload-utils';

import { type BuildHandler, createApp } from './app';
import type { Logger } from './logger';

const TOKEN = 'secret-token';

const built: ComponentBuildResult = {
  ok: true,
  js: 'js',
  css: 'css',
  hash: '0123456789abcdef',
  diagnostics: []
};

type Line = { level: string; msg: string } & Record<string, unknown>;

const recorder = () => {
  const lines: Line[] = [];
  const at =
    (level: string): Logger[keyof Logger] =>
    (msg, fields) => {
      lines.push({ level, msg, ...fields });
    };
  const logger: Logger = {
    info: at('info'),
    warn: at('warn'),
    error: at('error')
  };
  return { lines, logger };
};

const setup = (build: BuildHandler = jest.fn().mockResolvedValue(built)) => {
  const { lines, logger } = recorder();
  const app = createApp({ tokens: [TOKEN], build, logger });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request('/build', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    });
  const authed = { authorization: `Bearer ${TOKEN}` };
  return { app, build, post, authed, lines };
};

const valid = { source: 'export default () => null', tagName: 'cdwr-x-a' };

describe('component builder app', () => {
  it('answers the health check', async () => {
    const { app } = setup();

    const response = await app.request('/api/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  describe('POST /build', () => {
    it('refuses every build while the service has no token', async () => {
      const build: BuildHandler = jest.fn().mockResolvedValue(built);
      const unconfigured = createApp({ tokens: [], build });
      const response = await unconfigured.request('/build', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TOKEN}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(valid)
      });
      expect(response.status).toBe(503);
      expect(build).not.toHaveBeenCalled();
    });

    it('accepts either token during a rollover and refuses others', async () => {
      const build: BuildHandler = jest.fn().mockResolvedValue(built);
      const app = createApp({ tokens: ['new-token', 'old-token'], build });
      const post = (token: string) =>
        app.request('/build', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify(valid)
        });

      expect((await post('new-token')).status).toBe(200);
      expect((await post('old-token')).status).toBe(200);
      expect((await post('older-token')).status).toBe(401);
    });

    it('refuses a request without a token', async () => {
      const { post, build } = setup();

      expect((await post(valid)).status).toBe(401);
      expect(build).not.toHaveBeenCalled();
    });

    it.each([
      ['a wrong token', 'Bearer nope'],
      ['a token of another length', 'Bearer x'],
      ['another scheme', `Basic ${TOKEN}`],
      ['an empty token', 'Bearer ']
    ])('refuses %s', async (_name, authorization) => {
      const { post, build } = setup();

      expect((await post(valid, { authorization })).status).toBe(401);
      expect(build).not.toHaveBeenCalled();
    });

    it('returns the build result', async () => {
      const { post, build, authed } = setup();
      const propsSchema = [{ name: 'label', type: 'text', required: true }];

      const response = await post({ ...valid, propsSchema }, authed);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(built);
      expect(build).toHaveBeenCalledWith({ ...valid, propsSchema });
    });

    it('turns requests away above the pending cap', async () => {
      let release: (() => void) | undefined;
      const slow: BuildHandler = () =>
        new Promise((resolve) => {
          release = () => resolve(built);
        });
      const app = createApp({ tokens: [TOKEN], build: slow, maxPending: 1 });
      const request = () =>
        app.request('/build', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${TOKEN}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify(valid)
        });

      const first = request();
      // Until the first build has started, nothing is pending
      while (release === undefined) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      const second = await request();
      expect(second.status).toBe(503);

      release?.();
      expect((await first).status).toBe(200);

      // The slot is free again once the build is done
      const third = request();
      release = undefined;
      while (release === undefined) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      (release as () => void)();
      expect((await third).status).toBe(200);
    });

    it('gives up on a build that passes the deadline', async () => {
      const never: BuildHandler = () => new Promise(() => undefined);
      const app = createApp({ tokens: [TOKEN], build: never, deadlineMs: 20 });

      const response = await app.request('/build', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TOKEN}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(valid)
      });

      expect(response.status).toBe(504);
      expect(await response.json()).toMatchObject({ ok: false });
    });

    it('returns a failed build as a 200', async () => {
      const failed = {
        ok: false,
        diagnostics: [{ message: 'no', line: 1, column: 1, severity: 'error' }]
      };
      const { post, authed } = setup(jest.fn().mockResolvedValue(failed));

      const response = await post(valid, authed);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(failed);
    });

    it.each([
      ['a body that is not JSON', '{nope'],
      ['no source', { tagName: 'cdwr-x-a' }],
      ['no tag name', { source: 'x' }],
      ['an empty tag name', { source: 'x', tagName: '' }],
      ['a source over the limit', { ...valid, source: 'x'.repeat(200_001) }],
      ['props that are not a list', { ...valid, propsSchema: {} }],
      [
        'a prop of an unknown type',
        { ...valid, propsSchema: [{ name: 'a', type: 'date' }] }
      ]
    ])('answers 400 for %s', async (_name, body) => {
      const { post, build, authed } = setup();

      const response = await post(body, authed);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: expect.any(String) });
      expect(build).not.toHaveBeenCalled();
    });

    it('answers 500 with one diagnostic when the build throws', async () => {
      const { post, authed, lines } = setup(
        jest.fn().mockRejectedValue(new Error('boom'))
      );

      const response = await post(valid, authed);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.diagnostics).toHaveLength(1);
      expect(body.diagnostics[0].message).toContain('boom');
      expect(lines.at(-1)).toMatchObject({
        level: 'error',
        msg: 'build failed unexpectedly',
        requestId: response.headers.get('x-request-id'),
        error: 'boom',
        stack: expect.stringContaining('boom')
      });
    });
  });

  describe('logging', () => {
    const body = { ...valid, source: 'export default () => "SECRET-SOURCE"' };

    const text = (lines: Line[]) => JSON.stringify(lines);

    it('logs one line on receipt and one on completion, with the id', async () => {
      const finished: ComponentBuildResult = {
        ...built,
        diagnostics: [
          { message: 'w', line: 1, column: 1, severity: 'warning' },
          { message: 'w2', line: 1, column: 1, severity: 'warning' }
        ],
        props: [{ name: 'label', kind: 'string', optional: true }]
      };
      const { post, authed, lines } = setup(
        jest.fn().mockResolvedValue(finished)
      );
      const propsSchema = [{ name: 'label', type: 'text', required: true }];

      const response = await post({ ...body, propsSchema }, authed);
      const requestId = response.headers.get('x-request-id');

      expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(lines).toEqual([
        {
          level: 'info',
          msg: 'build received',
          requestId,
          tagName: 'cdwr-x-a',
          sourceLength: body.source.length,
          inputs: 1
        },
        {
          level: 'info',
          msg: 'build finished',
          requestId,
          durationMs: expect.any(Number),
          ok: true,
          jsBytes: 2,
          cssBytes: 3,
          errors: 0,
          warnings: 2,
          props: 1
        }
      ]);
      expect(text(lines)).not.toContain(TOKEN);
      expect(text(lines)).not.toContain('SECRET-SOURCE');
    });

    it('logs a failed build with its error count', async () => {
      const failed = {
        ok: false,
        diagnostics: [{ message: 'no', line: 1, column: 1, severity: 'error' }]
      };
      const { post, authed, lines } = setup(
        jest.fn().mockResolvedValue(failed)
      );

      await post(body, authed);

      expect(lines.at(-1)).toMatchObject({
        msg: 'build finished',
        ok: false,
        errors: 1,
        warnings: 0
      });
    });

    it('keeps a plain request id from the caller and echoes it', async () => {
      const { post, authed, lines } = setup();

      const response = await post(body, {
        ...authed,
        'x-request-id': 'cms-42'
      });

      expect(response.headers.get('x-request-id')).toBe('cms-42');
      expect(lines.every((l) => l['requestId'] === 'cms-42')).toBe(true);
    });

    it('replaces a request id that is not plain', async () => {
      const { post, authed } = setup();

      const response = await post(body, {
        ...authed,
        'x-request-id': 'a b'.repeat(100)
      });

      expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    });

    it.each([
      ['401', { 'x-request-id': 'r1' }, body, 401],
      ['400', { authorization: `Bearer ${TOKEN}` }, '{nope', 400]
    ])(
      'logs a refusal (%s) with status and reason',
      async (_n, headers, payload, status) => {
        const { post, lines } = setup();

        await post(payload, headers);

        expect(lines).toEqual([
          {
            level: 'warn',
            msg: 'build refused',
            requestId: expect.any(String),
            status,
            reason: expect.any(String)
          }
        ]);
        expect(text(lines)).not.toContain(TOKEN);
        expect(text(lines)).not.toContain('SECRET-SOURCE');
      }
    );

    it('logs a refusal for a service without a token and for an oversized body', async () => {
      const { lines, logger } = recorder();
      const build: BuildHandler = jest.fn().mockResolvedValue(built);
      const headers = {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json'
      };
      await createApp({ tokens: [], build, logger }).request('/build', {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      await createApp({ tokens: [TOKEN], build, logger }).request('/build', {
        method: 'POST',
        headers,
        body: 'x'.repeat(2_000_001)
      });

      expect(lines.map((l) => [l.msg, l['status']])).toEqual([
        ['build refused', 503],
        ['build refused', 413]
      ]);
    });

    it('logs a refusal when the build passes the deadline', async () => {
      const { lines, logger } = recorder();
      const app = createApp({
        tokens: [TOKEN],
        build: () => new Promise(() => undefined),
        deadlineMs: 20,
        logger
      });

      await app.request('/build', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TOKEN}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      expect(lines.at(-1)).toMatchObject({
        msg: 'build refused',
        status: 504
      });
    });
  });
});

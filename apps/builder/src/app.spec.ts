import type { ComponentBuildResult } from '@codeware/shared/util/payload-utils';

import { type BuildHandler, createApp } from './app';

const TOKEN = 'secret-token';

const built: ComponentBuildResult = {
  ok: true,
  js: 'js',
  css: 'css',
  hash: '0123456789abcdef',
  diagnostics: []
};

const setup = (build: BuildHandler = jest.fn().mockResolvedValue(built)) => {
  const app = createApp({ tokens: [TOKEN], build });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request('/build', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    });
  const authed = { authorization: `Bearer ${TOKEN}` };
  return { app, build, post, authed };
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
      const error = jest.spyOn(console, 'error').mockImplementation(() => {
        /* silence the expected log */
      });
      const { post, authed } = setup(
        jest.fn().mockRejectedValue(new Error('boom'))
      );

      const response = await post(valid, authed);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.diagnostics).toHaveLength(1);
      expect(body.diagnostics[0].message).toContain('boom');
      error.mockRestore();
    });
  });
});

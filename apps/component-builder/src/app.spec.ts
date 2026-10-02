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
  const app = createApp({ token: TOKEN, build });
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

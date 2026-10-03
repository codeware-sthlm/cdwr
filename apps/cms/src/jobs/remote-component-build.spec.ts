/** @jest-environment node */
import {
  REMOTE_BUILD_TIMEOUT_MS,
  buildRemotely
} from './remote-component-build';

const input = {
  tagName: 'cdwr-x-counter',
  source: 'export default () => null',
  propsSchema: [{ name: 'label', type: 'text' as const, required: false }]
};
const service = { url: 'https://builder.internal:3002', token: 'secret' };

const built = {
  ok: true,
  js: 'js',
  css: 'css',
  hash: '0123456789abcdef',
  diagnostics: [{ message: 'w', line: 1, column: 1, severity: 'warning' }],
  props: [{ name: 'label', kind: 'string', optional: true }]
};

const reply = (body: unknown, status = 200) =>
  jest.fn().mockResolvedValue(Response.json(body, { status }));

const message = (result: Awaited<ReturnType<typeof buildRemotely>>) =>
  result.diagnostics.map((d) => d.message);

describe('buildRemotely', () => {
  it('posts the input with the token and returns the service result', async () => {
    const fetchMock = reply(built);

    await expect(buildRemotely(input, service, fetchMock)).resolves.toEqual(
      built
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://builder.internal:3002/build');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer secret');
    expect(JSON.parse(init.body)).toEqual(input);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns a failed build as the service reported it', async () => {
    const failed = {
      ok: false,
      diagnostics: [{ message: 'no', line: 2, column: 3, severity: 'error' }]
    };

    await expect(buildRemotely(input, service, reply(failed))).resolves.toEqual(
      failed
    );
  });

  it('reports a refused token', async () => {
    const result = await buildRemotely(
      input,
      service,
      reply({ error: 'Unauthorized' }, 401)
    );

    expect(result.ok).toBe(false);
    expect(message(result)).toEqual([
      expect.stringContaining('The build service did not answer')
    ]);
    expect(message(result)[0]).toContain('401');
  });

  it('reports a connection error', async () => {
    const result = await buildRemotely(
      input,
      service,
      jest.fn().mockRejectedValue(new TypeError('fetch failed'))
    );

    expect(result.ok).toBe(false);
    expect(message(result)[0]).toContain('fetch failed');
  });

  it('reports a timeout', async () => {
    const timeout = Object.assign(new Error('timed out'), {
      name: 'TimeoutError'
    });
    const result = await buildRemotely(
      input,
      service,
      jest.fn().mockRejectedValue(timeout)
    );

    expect(result.ok).toBe(false);
    expect(message(result)[0]).toContain(`${REMOTE_BUILD_TIMEOUT_MS / 1000}`);
  });

  it.each([
    ['a body that is not JSON', () => new Response('<html>', { status: 200 })],
    ['JSON that is not a result', () => Response.json({ ok: true })],
    ['a hash that is not one', () => Response.json({ ...built, hash: 'nope' })],
    [
      'diagnostics that are malformed',
      () => Response.json({ ok: false, diagnostics: [{ message: 1 }] })
    ]
  ])('rejects %s', async (_name, make) => {
    const result = await buildRemotely(
      input,
      service,
      jest.fn().mockResolvedValue(make())
    );

    expect(result.ok).toBe(false);
    expect(message(result)).toHaveLength(1);
    expect(message(result)[0]).toContain('The build service did not answer');
  });
});

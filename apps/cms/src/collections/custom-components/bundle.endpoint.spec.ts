/** @jest-environment node */
import type { PayloadRequest } from 'payload';

import { customComponentBundleEndpoint } from './bundle.endpoint';

const HASH = '0123456789abcdef';

const find = jest.fn();

const call = (file: unknown) =>
  customComponentBundleEndpoint.handler({
    routeParams: { file },
    payload: { find }
  } as unknown as PayloadRequest);

describe('customComponentBundleEndpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    find.mockResolvedValue({ docs: [{ build: { js: 'console.log(1)' } }] });
  });

  it('serves the bundle as immutable, sniff-proof javascript', async () => {
    const response = await call(`${HASH}.js`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('console.log(1)');
    expect(response.headers.get('Content-Type')).toBe(
      'text/javascript; charset=utf-8'
    );
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable'
    );
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('looks the hash up past access control', async () => {
    await call(`${HASH}.js`);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'custom-components',
        where: { 'build.hash': { equals: HASH } },
        overrideAccess: true
      })
    );
  });

  it.each([
    ['no file', undefined],
    ['a hash without the extension', HASH],
    ['a hash that is too short', 'abc.js'],
    ['uppercase hex', `${HASH.toUpperCase()}.js`],
    ['a query-shaped value', `${HASH}.js?x=1`],
    ['a traversal', `../${HASH}.js`]
  ])('answers 404 without querying for %s', async (_name, file) => {
    const response = await call(file);

    expect(response.status).toBe(404);
    expect(find).not.toHaveBeenCalled();
  });

  it('answers 404 when no component has the hash', async () => {
    find.mockResolvedValue({ docs: [] });

    expect((await call(`${HASH}.js`)).status).toBe(404);
  });

  it('answers 404 when the component has no compiled code', async () => {
    find.mockResolvedValue({ docs: [{ build: { js: null } }] });

    expect((await call(`${HASH}.js`)).status).toBe(404);
  });
});

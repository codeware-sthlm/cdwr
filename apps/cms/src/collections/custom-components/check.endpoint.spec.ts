/** @jest-environment node */
import type { PayloadRequest } from 'payload';

import { runComponentBuild } from '../../jobs/run-component-build';

import {
  MAX_CHECK_SOURCE_LENGTH,
  customComponentCheckEndpoint,
  parseCheckBody
} from './check.endpoint';

jest.mock('../../jobs/run-component-build', () => ({
  ...jest.requireActual('../../jobs/run-component-build'),
  runComponentBuild: jest.fn()
}));

// The package barrel pulls in ESM-only plugin code Jest does not transform
jest.mock('@codeware/app-cms/util/misc', () => ({
  hasRole: jest.requireActual(
    '../../../../../libs/app-cms/util/misc/src/lib/has-role'
  ).hasRole,
  getComponentDeveloperTenantIDs: jest.requireActual(
    '../../../../../libs/app-cms/util/misc/src/lib/get-component-developer-tenant-ids'
  ).getComponentDeveloperTenantIDs
}));

const build = jest.mocked(runComponentBuild);

const SYSTEM = { collection: 'users', role: 'system-user', tenants: [] };
const DEVELOPER = {
  collection: 'users',
  role: 'user',
  tenants: [{ tenant: 1, role: 'user', componentDeveloper: true }]
};
const EDITOR = {
  collection: 'users',
  role: 'user',
  tenants: [{ tenant: 1, role: 'user', componentDeveloper: false }]
};

const call = (user: unknown, body: unknown) =>
  customComponentCheckEndpoint.handler({
    user,
    json: async () => {
      if (body instanceof Error) {
        throw body;
      }
      return body;
    },
    payload: { logger: { error: jest.fn() } }
  } as unknown as PayloadRequest);

describe('customComponentCheckEndpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    build.mockResolvedValue({
      ok: true,
      js: 'secret-js',
      css: 'secret-css',
      hash: 'h',
      diagnostics: [],
      props: [{ name: 'label', kind: 'string', optional: false }]
    });
  });

  it.each([
    ['nobody', null],
    ['an editor without the flag', EDITOR],
    [
      'a user without memberships',
      { collection: 'users', role: 'user', tenants: [] }
    ]
  ])('refuses %s', async (_label, user) => {
    const response = await call(user, { source: 'x' });

    expect(response.status).toBe(403);
    expect(build).not.toHaveBeenCalled();
  });

  it.each([
    ['a system user', SYSTEM],
    ['a component developer', DEVELOPER]
  ])('accepts %s', async (_label, user) => {
    expect((await call(user, { source: 'x' })).status).toBe(200);
  });

  it('answers with the findings and props, never the compiled code', async () => {
    const response = await call(SYSTEM, { source: 'x', slug: 'counter' });
    const text = await response.text();

    expect(JSON.parse(text)).toEqual({
      ok: true,
      diagnostics: [],
      props: [{ name: 'label', kind: 'string', optional: false }]
    });
    expect(text).not.toContain('secret');
    expect(build).toHaveBeenCalledWith({
      tagName: 'cdwr-x-counter',
      source: 'x',
      propsSchema: undefined
    });
  });

  it('uses a placeholder tag name for a missing or invalid slug', async () => {
    await call(SYSTEM, { source: 'x', slug: 'Not Valid' });
    await call(SYSTEM, { source: 'x' });

    expect(build).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tagName: 'cdwr-x-check' })
    );
    expect(build).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ tagName: 'cdwr-x-check' })
    );
  });

  it('passes the declared props on for comparison', async () => {
    await call(SYSTEM, {
      source: 'x',
      propsSchema: [{ name: 'label', type: 'text', required: true, id: 'z' }]
    });

    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({
        propsSchema: [{ name: 'label', type: 'text', required: true }]
      })
    );
  });

  it('leaves out a row whose name is not a prop name yet', async () => {
    await call(SYSTEM, {
      source: 'x',
      propsSchema: [
        { name: '', type: 'text' },
        { name: 'Bad name', type: 'text' },
        { name: 'ok', type: 'number' }
      ]
    });

    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({
        propsSchema: [{ name: 'ok', type: 'number', required: false }]
      })
    );
  });

  it('is not ok when a finding is an error', async () => {
    build.mockResolvedValue({
      ok: false,
      diagnostics: [{ message: 'bad', line: 1, column: 1, severity: 'error' }]
    });

    const response = await call(SYSTEM, { source: 'x' });

    expect(await response.json()).toEqual({
      ok: false,
      diagnostics: [{ message: 'bad', line: 1, column: 1, severity: 'error' }]
    });
  });

  it('is not ok when only the props comparison finds an error', async () => {
    build.mockResolvedValue({
      ok: true,
      js: 'js',
      css: 'css',
      hash: 'h',
      diagnostics: [{ message: 'type', line: 0, column: 0, severity: 'error' }]
    });

    expect((await (await call(SYSTEM, { source: 'x' })).json()).ok).toBe(false);
  });

  it.each([
    ['an unreadable body', new Error('bad json')],
    ['no source', {}],
    ['a source that is not text', { source: 3 }],
    [
      'an oversized source',
      { source: 'x'.repeat(MAX_CHECK_SOURCE_LENGTH + 1) }
    ],
    ['a slug that is not text', { source: 'x', slug: 3 }],
    ['props that are not a list', { source: 'x', propsSchema: {} }],
    [
      'a prop of an unknown type',
      { source: 'x', propsSchema: [{ name: 'a', type: 'date' }] }
    ]
  ])('rejects %s with a 400', async (_label, body) => {
    const response = await call(SYSTEM, body);

    expect(response.status).toBe(400);
    expect(build).not.toHaveBeenCalled();
  });

  it('answers 500 when the build throws', async () => {
    build.mockRejectedValue(new Error('boom'));

    expect((await call(SYSTEM, { source: 'x' })).status).toBe(500);
  });
});

describe('parseCheckBody', () => {
  it('accepts a source at the size limit', () => {
    expect(
      parseCheckBody({ source: 'x'.repeat(MAX_CHECK_SOURCE_LENGTH) })
    ).toMatchObject({ source: expect.any(String) });
  });
});

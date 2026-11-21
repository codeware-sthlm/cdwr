/** @jest-environment node */
import { agentDraftOnly, agentNeverPublishes } from './agent-draft-only.hook';

jest.mock('@codeware/app-cms/feature/env-loader', () => ({
  getEnv: jest.fn()
}));
// Payload is ESM-only; the hook needs nothing of it but the error class
jest.mock('payload', () => ({
  APIError: class APIError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
}));
// The misc barrel reaches this ESM-only module, which Jest cannot load
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));
jest.mock('../../../security/resolve-scoped-tenant', () => ({
  resolveScopedTenant: jest.fn()
}));
jest.mock('../../../security/verify-host-signature', () => ({
  verifyHostSignature: jest.fn()
}));

const agent = { id: 3, collection: 'agents', tenant: 7 };
const tenantKey = { id: 7, collection: 'tenants', slug: 'moon' };
const user = {
  id: 1,
  collection: 'users',
  role: 'user',
  tenants: [{ tenant: 7, role: 'user' }]
};

type BeforeOperation = Parameters<typeof agentDraftOnly>[0];

const run = (
  identity: unknown,
  args: Record<string, unknown>,
  operation = 'create'
) =>
  agentDraftOnly({
    args,
    operation,
    req: { user: identity }
  } as unknown as BeforeOperation) as unknown as Record<string, unknown>;

/** The hook throws synchronously, so wrap it for `toThrow` */
const refused = (args: Record<string, unknown>) => () => run(agent, args);

const apiError = expect.objectContaining({ status: 403 });

describe('agentDraftOnly', () => {
  it('leaves args alone for a user', () => {
    const args = { data: { _status: 'published' } };

    expect(run(user, args)).toBe(args);
    expect(args).toEqual({ data: { _status: 'published' } });
  });

  it('leaves args alone for a tenant key', () => {
    const args = { data: { _status: 'published' } };

    expect(run(tenantKey, args)).toBe(args);
    expect(args).toEqual({ data: { _status: 'published' } });
  });

  it('leaves args alone for an agent on other operations', () => {
    const args = { data: { _status: 'published' } };

    expect(run(agent, args, 'update')).toBe(args);
    expect(args).toEqual({ data: { _status: 'published' } });
  });

  it('stamps a draft, the agent and its workspace on create', () => {
    const args = run(agent, { data: { title: 'Hello', slug: 'hello' } });

    expect(args['draft']).toBe(true);
    expect(args['data']).toEqual({
      title: 'Hello',
      slug: 'hello',
      _status: 'draft',
      draftedBy: 3,
      tenant: 7
    });
  });

  it('stamps a create that sent no data at all', () => {
    const args = run(agent, {});

    expect(args['draft']).toBe(true);
    expect(args['data']).toEqual({
      _status: 'draft',
      draftedBy: 3,
      tenant: 7
    });
  });

  it.each([
    ['a published status', { data: { _status: 'published' } }],
    ['publishSpecificLocale', { data: {}, publishSpecificLocale: 'sv' }],
    ['publishAllLocales', { data: {}, publishAllLocales: true }],
    ['a duplicateFromID', { data: {}, duplicateFromID: 12 }],
    ['a managedBy', { data: { managedBy: 5 } }],
    ['another workspace as an id', { data: { tenant: 8 } }],
    ['another workspace as an object', { data: { tenant: { id: 8 } } }]
  ])('refuses %s with a 403', (_name, args) => {
    expect(refused(args)).toThrow(apiError);
  });

  it.each([
    ['an id', 7],
    ['an object', { id: 7 }]
  ])('accepts its own workspace as %s', (_name, tenant) => {
    const args = run(agent, { data: { tenant } });

    expect(args['data']).toMatchObject({ _status: 'draft', tenant: 7 });
  });
});

describe('agentNeverPublishes', () => {
  const change = (identity: unknown, data: Record<string, unknown>) =>
    (
      agentNeverPublishes as unknown as (args: {
        data: Record<string, unknown>;
        req: { user: unknown };
      }) => unknown
    )({ data, req: { user: identity } });

  it('throws 403 for an agent whose post is not a draft', () => {
    expect(() => change(agent, { _status: 'published' })).toThrow(apiError);
    expect(() => change(agent, {})).toThrow(apiError);
  });

  it('passes an agent’s draft', () => {
    const data = { _status: 'draft' };

    expect(change(agent, data)).toBe(data);
  });

  it('returns data unchanged for a user', () => {
    const data = { _status: 'published' };

    expect(change(user, data)).toBe(data);
  });
});

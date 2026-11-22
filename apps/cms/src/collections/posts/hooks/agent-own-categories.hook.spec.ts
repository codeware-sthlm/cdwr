/** @jest-environment node */
import { agentOwnCategories } from './agent-own-categories.hook';

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
const user = {
  id: 1,
  collection: 'users',
  role: 'user',
  tenants: [{ tenant: 7, role: 'user' }]
};

type BeforeOperation = Parameters<typeof agentOwnCategories>[0];

const count = jest.fn();

const run = (
  identity: unknown,
  args: Record<string, unknown>,
  operation = 'create'
) =>
  agentOwnCategories({
    args,
    operation,
    req: { user: identity, payload: { count } }
  } as unknown as BeforeOperation);

const status = (code: number) => expect.objectContaining({ status: code });

describe('agentOwnCategories', () => {
  beforeEach(() => {
    count.mockReset();
  });

  it('leaves a user alone', async () => {
    const args = { data: { categories: [9] } };

    await expect(run(user, args)).resolves.toBe(args);
    expect(count).not.toHaveBeenCalled();
  });

  it('leaves an agent alone on other operations', async () => {
    const args = { data: { categories: [9] } };

    await expect(run(agent, args, 'update')).resolves.toBe(args);
    expect(count).not.toHaveBeenCalled();
  });

  it('passes a draft without categories', async () => {
    const args = { data: { title: 't' } };

    await expect(run(agent, args)).resolves.toBe(args);
    expect(count).not.toHaveBeenCalled();
  });

  it('passes categories of the agent’s workspace', async () => {
    count.mockResolvedValue({ totalDocs: 2 });
    const args = { data: { categories: [4, { id: 5 }, 4] } };

    await expect(run(agent, args)).resolves.toBe(args);
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'categories',
        where: {
          and: [{ id: { in: [4, 5] } }, { tenant: { equals: 7 } }]
        },
        overrideAccess: true
      })
    );
  });

  it('refuses a category of another workspace', async () => {
    count.mockResolvedValue({ totalDocs: 1 });

    await expect(run(agent, { data: { categories: [4, 9] } })).rejects.toEqual(
      status(403)
    );
  });

  it('refuses categories that are not a list', async () => {
    await expect(run(agent, { data: { categories: 4 } })).rejects.toEqual(
      status(400)
    );
    expect(count).not.toHaveBeenCalled();
  });
});

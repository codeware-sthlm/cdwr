import type { UserAny } from '@codeware/shared/util/payload-types';
import type { AccessArgs } from 'payload';

import { componentDeveloperAccess } from './component-developer-access';
import { userOnlyAccess } from './user-only-access';

jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));
jest.mock('./user-only-access', () => ({ userOnlyAccess: jest.fn() }));

const scope = jest.mocked(userOnlyAccess);

const member = (tenant: number, componentDeveloper: boolean) => ({
  tenant,
  role: 'user',
  componentDeveloper
});

const user = (role: string, tenants: ReturnType<typeof member>[] = []) =>
  ({ id: 1, role, tenants }) as unknown as UserAny;

const call = (
  operation: Parameters<typeof componentDeveloperAccess>[0],
  who: UserAny,
  data?: unknown
) =>
  componentDeveloperAccess(operation)({
    req: { user: who },
    data
  } as unknown as AccessArgs);

beforeEach(() => {
  scope.mockReturnValue(async () => true);
});

describe('componentDeveloperAccess create', () => {
  const developer = user('user', [member(1, true), member(2, false)]);

  it('lets a system user create anywhere', async () => {
    await expect(
      call('create', user('system-user'), { tenant: 9 })
    ).resolves.toBe(true);
  });

  it('lets a developer create in their workspace, bare or populated', async () => {
    await expect(call('create', developer, { tenant: 1 })).resolves.toBe(true);
    await expect(
      call('create', developer, { tenant: { id: 1 } })
    ).resolves.toBe(true);
  });

  it('refuses a developer creating in another workspace', async () => {
    await expect(call('create', developer, { tenant: 3 })).resolves.toBe(false);
  });

  it('refuses an editor without the developer flag', async () => {
    await expect(
      call('create', user('user', [member(1, false)]), { tenant: 1 })
    ).resolves.toBe(false);
  });

  it('refuses data without a tenant', async () => {
    await expect(call('create', developer, {})).resolves.toBe(false);
  });

  it('offers Create to a developer when asked without data', async () => {
    await expect(call('create', developer)).resolves.toBe(true);
    await expect(
      call('create', user('user', [member(1, false)]))
    ).resolves.toBe(false);
  });

  it('keeps the refusal of userOnlyAccess', async () => {
    scope.mockReturnValue(async () => false);
    await expect(call('create', developer, { tenant: 1 })).resolves.toBe(false);
  });
});

describe('componentDeveloperAccess update and delete', () => {
  it('constrains to the developer workspaces', async () => {
    const developer = user('user', [member(1, true), member(2, false)]);
    for (const operation of ['update', 'delete'] as const) {
      await expect(call(operation, developer)).resolves.toEqual({
        tenant: { in: [1] }
      });
    }
  });

  it('adds the constraint to the scoped one', async () => {
    scope.mockReturnValue(async () => ({ tenant: { equals: 1 } }));
    await expect(
      call('update', user('user', [member(1, true)]))
    ).resolves.toEqual({
      and: [{ tenant: { equals: 1 } }, { tenant: { in: [1] } }]
    });
  });
});

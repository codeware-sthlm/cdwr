import type { UserAny } from '@codeware/shared/util/payload-types';
import type { CollectionBeforeChangeHook } from 'payload';

import { assertDeveloperInTenant } from './assert-developer-in-tenant.hook';

// ESM-only, and not what is under test
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));
jest.mock('payload', () => ({ APIError: Error }));

type Args = Parameters<CollectionBeforeChangeHook>[0];

const member = (tenant: number, componentDeveloper: boolean) => ({
  tenant,
  role: 'user',
  componentDeveloper
});

const user = (role: string, tenants: ReturnType<typeof member>[] = []) =>
  ({ id: 1, role, tenants }) as unknown as UserAny;

const developer = user('user', [member(1, true), member(2, false)]);

const run = (
  args: Partial<Args> & { data: Record<string, unknown>; who: UserAny }
) => {
  const { who, ...rest } = args;
  return assertDeveloperInTenant({
    context: {},
    operation: 'create',
    originalDoc: undefined,
    req: { user: who },
    ...rest
  } as unknown as Args);
};

describe('assertDeveloperInTenant', () => {
  it('lets a developer create in their workspace, bare or populated', () => {
    expect(run({ who: developer, data: { tenant: 1 } })).toEqual({ tenant: 1 });
    expect(run({ who: developer, data: { tenant: { id: 1 } } })).toEqual({
      tenant: { id: 1 }
    });
  });

  it('refuses another workspace, a workspace without the flag, and none', () => {
    expect(() => run({ who: developer, data: { tenant: 3 } })).toThrow(
      /develop/
    );
    expect(() => run({ who: developer, data: { tenant: 2 } })).toThrow(
      /develop/
    );
    expect(() => run({ who: developer, data: {} })).toThrow(/develop/);
  });

  it('lets a system user and the seed through', () => {
    expect(run({ who: user('system-user'), data: { tenant: 3 } })).toEqual({
      tenant: 3
    });
    expect(
      run({
        who: developer,
        data: { tenant: 3 },
        context: { seedAction: true }
      })
    ).toEqual({ tenant: 3 });
  });

  it('on update only minds a changed workspace', () => {
    const originalDoc = { tenant: 3 };
    expect(
      run({
        who: developer,
        data: { source: 'x' },
        operation: 'update',
        originalDoc
      })
    ).toEqual({ source: 'x' });
    expect(
      run({
        who: developer,
        data: { tenant: 3 },
        operation: 'update',
        originalDoc
      })
    ).toEqual({ tenant: 3 });
    expect(() =>
      run({
        who: developer,
        data: { tenant: 2 },
        operation: 'update',
        originalDoc
      })
    ).toThrow(/develop/);
  });
});

import type { UserAny } from '@codeware/shared/util/payload-types';
import { describe, expect, it } from 'vitest';

import { type TotpResetTarget, canResetTotp } from './can-reset-totp';

type Membership = { tenant: number; role: 'reader' | 'user' | 'admin' };

const user = (
  id: number,
  role: 'user' | 'system-user',
  tenants: Array<Membership> = []
) => ({ id, role, tenants }) as unknown as UserAny & TotpResetTarget;

const system = user(1, 'system-user');
const adminOf7 = user(2, 'user', [{ tenant: 7, role: 'admin' }]);
const adminOf7And8 = user(3, 'user', [
  { tenant: 7, role: 'admin' },
  { tenant: 8, role: 'admin' }
]);

describe('canResetTotp', () => {
  it.each([
    {
      name: 'a system user resets a member',
      requester: system,
      target: user(10, 'user', [{ tenant: 7, role: 'user' }]),
      expected: true
    },
    {
      name: 'a system user resets another system user',
      requester: system,
      target: user(11, 'system-user'),
      expected: true
    },
    {
      name: 'a system user resets a user with no workspace',
      requester: system,
      target: user(12, 'user'),
      expected: true
    },
    {
      name: 'a system user resets themself',
      requester: system,
      target: system,
      expected: false
    },
    {
      name: 'a workspace admin resets a member of their workspace',
      requester: adminOf7,
      target: user(10, 'user', [{ tenant: 7, role: 'reader' }]),
      expected: true
    },
    {
      name: 'a workspace admin resets another admin of their workspace',
      requester: adminOf7,
      target: user(10, 'user', [{ tenant: 7, role: 'admin' }]),
      expected: true
    },
    {
      name: 'a workspace admin resets a user in all of their workspaces',
      requester: adminOf7And8,
      target: user(10, 'user', [
        { tenant: 7, role: 'user' },
        { tenant: 8, role: 'reader' }
      ]),
      expected: true
    },
    {
      name: 'a workspace admin resets a user also in another workspace',
      requester: adminOf7,
      target: user(10, 'user', [
        { tenant: 7, role: 'user' },
        { tenant: 9, role: 'user' }
      ]),
      expected: false
    },
    {
      name: 'an editor of the workspace resets a member',
      requester: user(4, 'user', [{ tenant: 7, role: 'user' }]),
      target: user(10, 'user', [{ tenant: 7, role: 'reader' }]),
      expected: false
    },
    {
      name: 'a workspace admin resets a system user',
      requester: adminOf7,
      target: user(11, 'system-user', [{ tenant: 7, role: 'user' }]),
      expected: false
    },
    {
      name: 'a workspace admin resets a user with no workspace',
      requester: adminOf7,
      target: user(12, 'user'),
      expected: false
    },
    {
      name: 'a workspace admin resets themself',
      requester: adminOf7,
      target: adminOf7,
      expected: false
    }
  ])('$name: $expected', ({ requester, target, expected }) => {
    expect(canResetTotp(requester, target)).toBe(expected);
  });

  it('reads a populated workspace in the target', () => {
    const target = {
      id: 10,
      role: 'user',
      tenants: [{ tenant: { id: 7 }, role: 'user' }]
    } as unknown as TotpResetTarget;
    expect(canResetTotp(adminOf7, target)).toBe(true);
  });

  it('refuses a target without an id, such as a new user', () => {
    expect(canResetTotp(system, { role: 'user', tenants: [] })).toBe(false);
  });

  it.each([
    { name: 'no requester', requester: null },
    {
      name: 'a tenant api key',
      requester: { id: 7, collection: 'tenants' } as unknown as UserAny
    }
  ])('refuses $name', ({ requester }) => {
    expect(canResetTotp(requester, user(10, 'user'))).toBe(false);
  });

  it('refuses a missing target', () => {
    expect(canResetTotp(system, null)).toBe(false);
  });
});

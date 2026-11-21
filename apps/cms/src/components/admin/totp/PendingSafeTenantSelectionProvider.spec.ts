/** @jest-environment node */
import type { UserAny } from '@codeware/shared/util/payload-types';
import { TenantSelectionProvider } from '@payloadcms/plugin-multi-tenant/rsc';
import type { ComponentProps, ReactElement } from 'react';

import { PendingSafeTenantSelectionProvider } from './PendingSafeTenantSelectionProvider';

// ESM-only, and the provider itself is not what is under test
jest.mock('@payloadcms/plugin-multi-tenant/rsc', () => ({
  TenantSelectionProvider: jest.fn()
}));
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));

type Props = ComponentProps<typeof PendingSafeTenantSelectionProvider>;

const pendingAdmin = {
  id: 5,
  role: 'user',
  hasTotp: true,
  tenants: [{ tenant: 7, role: 'admin' }],
  _strategy: 'local-jwt'
};
const verifiedAdmin = { ...pendingAdmin, _strategy: 'totp' };
const member = {
  id: 6,
  role: 'user',
  tenants: [{ tenant: 7, role: 'user' }],
  _strategy: 'local-jwt'
};

const render = async (user: unknown) => {
  const props = {
    children: 'page',
    tenantsCollectionSlug: 'tenants',
    user: user as UserAny | null
  } as unknown as Props;
  return (await PendingSafeTenantSelectionProvider(props)) as ReactElement<
    Record<string, unknown>
  >;
};

describe('PendingSafeTenantSelectionProvider', () => {
  it('gives the plugin no user while the code is still owed', async () => {
    const element = await render(pendingAdmin);

    expect(element.type).toBe(TenantSelectionProvider);
    expect(element.props).toMatchObject({
      children: 'page',
      tenantsCollectionSlug: 'tenants',
      user: null
    });
  });

  it.each([
    { name: 'a verified admin', user: verifiedAdmin },
    { name: 'a member', user: member }
  ])('passes $name through', async ({ user }) => {
    expect((await render(user)).props['user']).toBe(user);
  });

  it('passes no user through as none', async () => {
    expect((await render(null)).props['user']).toBeNull();
  });
});

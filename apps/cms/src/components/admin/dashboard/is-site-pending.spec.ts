/** @jest-environment node */
import type { Payload, TypedUser } from 'payload';

import { getSingleTenantId } from '../utils/tenant-where';

import { isSitePending } from './is-site-pending';

// The ESM-only helper is pulled in through the tenant utilities
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));
jest.mock('../utils/tenant-where', () => ({
  getSingleTenantId: jest.fn()
}));

const findByID = jest.fn();
const payload = { findByID } as unknown as Payload;

const memberOf = (tenant: number) =>
  ({
    id: 2,
    collection: 'users',
    role: 'user',
    tenants: [{ tenant, role: 'admin' }]
  }) as unknown as TypedUser;

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getSingleTenantId).mockResolvedValue(5);
  findByID.mockResolvedValue({ status: 'pending' });
});

describe('isSitePending', () => {
  it('is true for a member of a pending workspace', async () => {
    expect(await isSitePending(payload, memberOf(5))).toBe(true);
  });

  it('is false once the workspace is active', async () => {
    findByID.mockResolvedValue({ status: 'active' });

    expect(await isSitePending(payload, memberOf(5))).toBe(false);
  });

  it('never shows for a system user', async () => {
    const systemUser = {
      id: 1,
      role: 'system-user',
      tenants: []
    } as unknown as TypedUser;

    expect(await isSitePending(payload, systemUser)).toBe(false);
    expect(findByID).not.toHaveBeenCalled();
  });

  it('ignores a selected workspace the viewer is not in', async () => {
    expect(await isSitePending(payload, memberOf(6))).toBe(false);
    expect(findByID).not.toHaveBeenCalled();
  });

  it('is false, not an error, when the workspace is gone', async () => {
    findByID.mockResolvedValue(null);

    expect(await isSitePending(payload, memberOf(5))).toBe(false);
  });
});

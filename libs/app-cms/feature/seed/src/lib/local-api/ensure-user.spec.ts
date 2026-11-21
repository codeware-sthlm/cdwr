import type { Payload } from 'payload';

import { type UserData, ensureUser } from './ensure-user';

const payloadWith = (found: number) => {
  const created: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const payload = {
    find: async () => ({ totalDocs: found, docs: [{ id: 7 }] }),
    create: async (args: { data: Record<string, unknown> }) => {
      created.push(args);
      return { id: 8, ...args.data };
    },
    update: async (args: Record<string, unknown>) => {
      updated.push(args);
      return args;
    }
  } as unknown as Payload;
  return { payload, created, updated };
};

const user = {
  email: 'titan@local.dev',
  name: 'Titan',
  password: 'new-password',
  role: 'user'
} as UserData;

describe('ensureUser', () => {
  it('writes the password to an existing user when asked to, and returns the id', async () => {
    const { payload, created, updated } = payloadWith(1);

    const result = await ensureUser(payload, user, {
      locale: 'en',
      resetPassword: true,
      transactionID: 't1'
    });

    expect(result).toBe(7);
    expect(created).toEqual([]);
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      collection: 'users',
      id: 7,
      data: { password: 'new-password' },
      context: { seedAction: true },
      req: { transactionID: 't1' }
    });
  });

  it('leaves an existing user alone without it', async () => {
    const { payload, created, updated } = payloadWith(1);

    const result = await ensureUser(payload, user, {
      locale: 'en',
      transactionID: 't1'
    });

    expect(result).toBe(7);
    expect(created).toEqual([]);
    expect(updated).toEqual([]);
  });

  it('creates a missing user, password included', async () => {
    const { payload, created, updated } = payloadWith(0);

    await ensureUser(payload, user, {
      locale: 'en',
      resetPassword: true,
      transactionID: 't1'
    });

    expect(updated).toEqual([]);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      collection: 'users',
      data: { email: 'titan@local.dev', password: 'new-password' },
      context: { seedAction: true }
    });
  });
});

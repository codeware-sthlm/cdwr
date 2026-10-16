import type { Payload } from 'payload';

import { ensureInviteCode } from './ensure-invite-code';

const payloadWith = (found: number) => {
  const calls: Array<Record<string, unknown>> = [];
  const created: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const payload = {
    find: async (args: Record<string, unknown>) => {
      calls.push(args);
      return { totalDocs: found, docs: [{ id: 7, uses: 1, maxUses: 1 }] };
    },
    create: async (args: { data: Record<string, unknown> }) => {
      calls.push(args);
      created.push(args.data);
      return { id: 8, ...args.data };
    },
    update: async (args: Record<string, unknown>) => {
      updated.push(args);
      return args;
    }
  } as unknown as Payload;
  return { payload, calls, created, updated };
};

const code = {
  code: 'SEED-MANY-0000-0001',
  note: 'Seeded',
  maxUses: 100
};

describe('ensureInviteCode', () => {
  it('hands a missing code to the collection in plain, for its hook to split', async () => {
    const { payload, created } = payloadWith(0);

    await ensureInviteCode(payload, code, { transactionID: 't1' });

    expect(created[0]).toMatchObject({
      code: 'SEED-MANY-0000-0001',
      note: 'Seeded',
      maxUses: 100
    });
    expect(created[0]).not.toHaveProperty('lookup');
  });

  it('finds a code by its public half and runs lookup and create in the given transaction', async () => {
    const { payload, calls } = payloadWith(0);

    await ensureInviteCode(payload, code, { transactionID: 't1' });

    expect(calls[0]).toMatchObject({
      collection: 'invite-codes',
      where: { lookup: { equals: 'SEEDMANY' } },
      req: { transactionID: 't1' }
    });
    expect(calls[1]).toMatchObject({ req: { transactionID: 't1' } });
  });

  it('leaves an existing code alone, spent uses and all', async () => {
    const { payload, created, updated } = payloadWith(1);

    const result = await ensureInviteCode(payload, code, {
      transactionID: undefined
    });

    expect(result).toBe(7);
    expect(created).toEqual([]);
    expect(updated).toEqual([]);
  });

  it('refuses a code the collection would not take', async () => {
    const { payload, calls } = payloadWith(0);

    await expect(
      ensureInviteCode(
        payload,
        { ...code, code: 'not-a-code' },
        { transactionID: undefined }
      )
    ).rejects.toThrow("'not-a-code' is not an invite code");
    expect(calls).toEqual([]);
  });
});

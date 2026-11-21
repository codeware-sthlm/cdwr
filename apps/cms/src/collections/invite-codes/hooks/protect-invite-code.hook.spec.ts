import { verifyInviteSecret } from '@codeware/shared/util/invite-code';
import type { InviteCode } from '@codeware/shared/util/payload-types';

import { protectInviteCode } from './protect-invite-code.hook';

jest.mock('payload', () => ({ ValidationError: Error }));

type HookArgs = Parameters<typeof protectInviteCode>[0];

const stored = {
  id: 1,
  lookup: 'ABCDEFGH',
  codeHash: 'scrypt$salt$hash',
  maxUses: 1,
  uses: 3,
  note: 'Acme',
  updatedAt: '',
  createdAt: ''
} satisfies InviteCode;

const run = (
  operation: HookArgs['operation'],
  data: Partial<InviteCode>,
  originalDoc?: InviteCode
) =>
  protectInviteCode({
    data,
    operation,
    originalDoc,
    req: { t: (key: string) => key }
  } as unknown as HookArgs) as Promise<Partial<InviteCode>>;

describe('protectInviteCode', () => {
  describe('create', () => {
    it('stores the lookup and a hash of the secret, and drops the plain code', async () => {
      const data = await run('create', {
        code: 'abcd-efgh-jkmn-pqrs',
        note: 'Acme'
      });

      expect(data.lookup).toBe('ABCDEFGH');
      expect(data.code).toBeUndefined();
      expect(data.codeHash).toMatch(/^scrypt\$/);
      expect(data.codeHash).not.toContain('JKMNPQRS');
      await expect(
        verifyInviteSecret('JKMNPQRS', data.codeHash ?? '')
      ).resolves.toBe(true);
    });

    it.each([undefined, null, '', 'too-short'])(
      'refuses the code %p',
      async (code) => {
        await expect(run('create', { code })).rejects.toThrow();
      }
    );
  });

  describe('update', () => {
    it.each([
      ['lookup', { lookup: 'ZZZZZZZZ' }],
      ['hash', { codeHash: 'scrypt$other$hash' }],
      ['code', { code: 'ABCD-EFGH-JKMN-PQRS' }]
    ])('refuses a change of the %s', async (_name, change) => {
      await expect(run('update', change, stored)).rejects.toThrow();
    });

    it('accepts the lookup as it was loaded', async () => {
      const data = await run(
        'update',
        { lookup: 'ABCDEFGH', note: 'New' },
        stored
      );

      expect(data.note).toBe('New');
    });

    it('never writes the number of uses on an update', async () => {
      const data = await run('update', { uses: 0, maxUses: 5 }, stored);

      expect(data).not.toHaveProperty('uses');
      expect(data.maxUses).toBe(5);
    });
  });
});

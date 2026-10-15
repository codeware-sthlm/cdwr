import type { CollectionBeforeOperationHook } from 'payload';

import { verifyOnlySelfServeHook } from './verify-only-self-serve.hook';

type HookArgs = Parameters<CollectionBeforeOperationHook<'users'>>[0];

const run = (operation: string, context: Record<string, unknown> = {}) => {
  const args = { data: { email: 'a@b.se' }, req: { context } };
  const result = verifyOnlySelfServeHook({
    args,
    operation
  } as unknown as HookArgs);
  return result as unknown as typeof args & {
    data: { _verified?: boolean };
    disableVerificationEmail?: boolean;
  };
};

describe('verifyOnlySelfServeHook', () => {
  it('verifies a user created outside signup and sends no email', () => {
    const result = run('create');

    expect(result.data._verified).toBe(true);
    expect(result.disableVerificationEmail).toBe(true);
  });

  it('leaves a signup create alone', () => {
    const result = run('create', { signup: true });

    expect(result.data._verified).toBeUndefined();
    expect(result.disableVerificationEmail).toBeUndefined();
  });

  it('leaves other operations alone', () => {
    const result = run('update');

    expect(result.data._verified).toBeUndefined();
    expect(result.disableVerificationEmail).toBeUndefined();
  });
});

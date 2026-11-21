import type { CollectionBeforeOperationHook } from 'payload';

import { verifyOnlySelfServeHook } from './verify-only-self-serve.hook';

// The misc barrel reaches an ESM-only module that Jest cannot load
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({}));

type HookArgs = Parameters<CollectionBeforeOperationHook<'users'>>[0];

const run = (
  operation: string,
  context: Record<string, unknown> = {},
  user: { role: string; tenants: [] } | null = null
) => {
  const args = { data: { email: 'a@b.se' }, req: { context, user } };
  const result = verifyOnlySelfServeHook({
    args,
    operation
  } as unknown as HookArgs);
  return result as unknown as typeof args & {
    data: { _verified?: boolean };
    disableVerificationEmail?: boolean;
  };
};

const verified = (result: ReturnType<typeof run>) =>
  result.data._verified === true && result.disableVerificationEmail === true;

describe('verifyOnlySelfServeHook', () => {
  it('verifies a user a system user creates, and sends no email', () => {
    const result = run('create', {}, { role: 'system-user', tenants: [] });

    expect(verified(result)).toBe(true);
    expect(result.req.context.mailVerification).toBeUndefined();
  });

  it('verifies a user the seed creates', () => {
    expect(verified(run('create', { seedAction: true }))).toBe(true);
  });

  it('verifies a user server code creates without a user', () => {
    expect(verified(run('create'))).toBe(true);
  });

  it('leaves a user a tenant admin creates unverified and flags the mail', () => {
    const result = run('create', {}, { role: 'user', tenants: [] });

    expect(result.data._verified).toBeUndefined();
    expect(result.req.context.mailVerification).toBe(true);
    expect(result.disableVerificationEmail).toBe(true);
  });

  it('leaves a signup create unverified, mailed by the route', () => {
    const result = run('create', { signup: true });

    expect(result.data._verified).toBeUndefined();
    expect(result.req.context.mailVerification).toBeUndefined();
    expect(result.disableVerificationEmail).toBe(true);
  });

  it('leaves other operations alone', () => {
    const result = run('update', {}, { role: 'system-user', tenants: [] });

    expect(result.data._verified).toBeUndefined();
    expect(result.req.context.mailVerification).toBeUndefined();
    expect(result.disableVerificationEmail).toBeUndefined();
  });
});

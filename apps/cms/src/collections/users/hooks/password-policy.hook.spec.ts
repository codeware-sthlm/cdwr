import type { CollectionBeforeOperationHook } from 'payload';

import { isBreachedPassword } from '../utils/is-breached-password';

import { passwordPolicyHook } from './password-policy.hook';

// ESM-only, and not what is under test
jest.mock('payload', () => ({
  ValidationError: class ValidationError extends Error {
    data: { errors: Array<{ message: string }> };
    constructor(data: { errors: Array<{ message: string }> }) {
      super('ValidationError');
      this.data = data;
    }
  }
}));
jest.mock('@codeware/app-cms/util/i18n', () => ({
  customT: () => (key: string) => key
}));
jest.mock('../utils/is-breached-password', () => ({
  isBreachedPassword: jest.fn().mockResolvedValue(false)
}));

type HookArgs = Parameters<CollectionBeforeOperationHook<'users'>>[0];

const breached = jest.mocked(isBreachedPassword);

const run = (
  operation: string,
  password: unknown,
  context: Record<string, unknown> = {}
) => {
  const req = { context };
  return passwordPolicyHook({
    args: { data: { password }, req },
    operation,
    req
  } as unknown as HookArgs);
};

const refusal = async (promise: ReturnType<typeof run>) => {
  try {
    await promise;
  } catch (error) {
    return (
      error as { data: { errors: Array<{ message: string }> } }
    ).data.errors.map(({ message }) => message);
  }
  return null;
};

describe('passwordPolicyHook', () => {
  beforeEach(() => breached.mockClear().mockResolvedValue(false));

  it.each(['create', 'update', 'resetPassword'])(
    'refuses a short password on %s',
    async (operation) => {
      expect(await refusal(run(operation, 'x'.repeat(11)))).toEqual([
        'authentication:passwordTooShort'
      ]);
    }
  );

  it('refuses a password over the ceiling', async () => {
    expect(await refusal(run('create', 'x'.repeat(129)))).toEqual([
      'authentication:passwordTooLong'
    ]);
  });

  it('refuses a breached password', async () => {
    breached.mockResolvedValue(true);

    expect(await refusal(run('create', 'x'.repeat(12)))).toEqual([
      'authentication:passwordBreached'
    ]);
  });

  it('lets a long, unbreached password through', async () => {
    expect(await refusal(run('update', 'x'.repeat(12)))).toBeNull();
  });

  it('checks no length before asking about a breach', async () => {
    await refusal(run('create', 'short'));

    expect(breached).not.toHaveBeenCalled();
  });

  it('leaves an update without a password alone', async () => {
    expect(await refusal(run('update', undefined))).toBeNull();
    expect(breached).not.toHaveBeenCalled();
  });

  it('leaves the seed alone', async () => {
    expect(
      await refusal(run('create', 'dev', { seedAction: true }))
    ).toBeNull();
  });

  it('leaves a login alone', async () => {
    expect(await refusal(run('login', 'dev'))).toBeNull();
  });
});

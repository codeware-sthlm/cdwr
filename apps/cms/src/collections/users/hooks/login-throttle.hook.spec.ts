import { resetRateLimits } from '@codeware/shared/util/human-check';
import type { CollectionBeforeOperationHook } from 'payload';

import { loginThrottleHook } from './login-throttle.hook';

// ESM-only, and not what is under test
jest.mock('payload', () => ({
  APIError: class APIError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
}));
jest.mock('@codeware/app-cms/util/i18n', () => ({
  customT: () => (key: string) => key
}));

type HookArgs = Parameters<CollectionBeforeOperationHook<'users'>>[0];

const run = (operation: string, address?: string) => {
  const headers = new Headers(address ? { 'fly-client-ip': address } : {});
  const req = { headers };
  return () =>
    loginThrottleHook({
      args: { data: {}, req },
      operation,
      req
    } as unknown as HookArgs);
};

describe('loginThrottleHook', () => {
  beforeEach(() => resetRateLimits());

  it('refuses the 21st login from one address', () => {
    for (let i = 0; i < 20; i++) {
      expect(run('login', '203.0.113.7')).not.toThrow();
    }

    expect(run('login', '203.0.113.7')).toThrow(
      'authentication:tooManyLoginAttempts'
    );
  });

  it('counts each address on its own', () => {
    for (let i = 0; i < 20; i++) {
      run('login', '203.0.113.7')();
    }

    expect(run('login', '203.0.113.8')).not.toThrow();
  });

  it('answers 429', () => {
    for (let i = 0; i < 20; i++) {
      run('login', '203.0.113.7')();
    }

    expect(run('login', '203.0.113.7')).toThrow(
      expect.objectContaining({ status: 429 })
    );
  });

  it('does not count a login without an address', () => {
    for (let i = 0; i < 30; i++) {
      expect(run('login')).not.toThrow();
    }
  });

  it('does not count other operations', () => {
    for (let i = 0; i < 30; i++) {
      expect(run('update', '203.0.113.7')).not.toThrow();
    }
  });
});

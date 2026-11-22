import { loginPageStep } from './member-login';

jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));

const member = (extra: Record<string, unknown> = {}) =>
  ({
    id: 1,
    email: 'm@local.dev',
    collection: 'users',
    role: 'user',
    tenants: [],
    ...extra
  }) as never;

describe('loginPageStep', () => {
  it('shows the password form for anything but the code step', () => {
    expect(loginPageStep(undefined, null)).toBe('password');
    expect(loginPageStep('other', member())).toBe('password');
  });

  it('shows the password form on the code step without a session', () => {
    expect(loginPageStep('code', null)).toBe('password');
  });

  it('asks for the code while the second factor is pending', () => {
    expect(
      loginPageStep('code', member({ hasTotp: true, _strategy: 'local-jwt' }))
    ).toBe('code');
  });

  it('continues when the session owes no code, as on a trusted device', () => {
    expect(
      loginPageStep('code', member({ hasTotp: true, _strategy: 'totp' }))
    ).toBe('continue');
  });
});

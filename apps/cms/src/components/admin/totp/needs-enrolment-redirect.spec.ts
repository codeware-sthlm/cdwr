/** @jest-environment node */
import {
  type TotpUser,
  needsEnrolmentRedirect
} from './needs-enrolment-redirect';

const SETUP = '/admin/setup-totp';
const required = (over: TotpUser = {}): TotpUser => ({
  _strategy: 'local-jwt',
  hasTotp: false,
  totpRequired: true,
  ...over
});

describe('needsEnrolmentRedirect', () => {
  it('sends a required user without a secret to setup', () => {
    expect(needsEnrolmentRedirect(required(), '/admin', SETUP)).toBe(true);
  });

  it('sends a totp session without a secret to setup (cookie left from a reset)', () => {
    expect(
      needsEnrolmentRedirect(required({ _strategy: 'totp' }), '/admin', SETUP)
    ).toBe(true);
  });

  it.each<[string, TotpUser | null]>([
    ['no user', null],
    ['an enrolled user', required({ hasTotp: true })],
    ['a verified totp session', required({ _strategy: 'totp', hasTotp: true })],
    ['an api key', required({ _strategy: 'api-key' })],
    ['a user who need not enrol', required({ totpRequired: false })],
    ['no strategy', required({ _strategy: undefined })]
  ])('leaves %s alone', (_name, user) => {
    expect(needsEnrolmentRedirect(user, '/admin', SETUP)).toBe(false);
  });

  it.each([SETUP, `${SETUP}/`])('stays on the setup view (%s)', (path) => {
    expect(needsEnrolmentRedirect(required(), path, SETUP)).toBe(false);
  });
});

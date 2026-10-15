import { InviteCodeRefused } from '@codeware/app-cms/data-access';
import { ValidationError } from 'payload';

import {
  REFUSAL_STATUS,
  type SignupBody,
  parseSignup,
  signupRefusal
} from './signup';

// The ESM-only helper is pulled in through the data-access barrel
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));

// ESM-only packages the data-access barrel pulls in
jest.mock('@payloadcms/db-postgres', () => ({ sql: jest.fn() }));

// The real error class is ESM-only; this one keeps what `signupRefusal` reads
jest.mock('payload', () => ({
  ValidationError: class ValidationError extends Error {
    data: { errors: Array<{ path: string }> };
    constructor(results: { errors: Array<{ path: string }> }) {
      super('ValidationError');
      this.data = results;
    }
  }
}));

const valid: SignupBody = {
  code: 'abcd-efgh',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'correct horse battery',
  siteName: 'Ada Engines',
  deployment: 'ada-engines'
};

describe('parseSignup', () => {
  it('accepts valid input, trimmed and with the email lowercased', () => {
    const result = parseSignup({
      ...valid,
      code: '  abcd-efgh ',
      name: ' Ada Lovelace ',
      email: '  Ada@Example.COM ',
      siteName: ' Ada Engines ',
      deployment: ' ada-engines '
    });

    expect(result).toEqual({
      ok: true,
      input: { ...valid, locale: 'en' }
    });
  });

  it.each(['code', 'name', 'email', 'siteName'])(
    'refuses a missing %s as invalid',
    (field) => {
      expect(parseSignup({ ...valid, [field]: undefined })).toEqual({
        ok: false,
        refusal: 'invalid'
      });
      expect(parseSignup({ ...valid, [field]: '   ' })).toEqual({
        ok: false,
        refusal: 'invalid'
      });
    }
  );

  it('refuses a malformed email as invalid', () => {
    expect(parseSignup({ ...valid, email: 'not-an-email' })).toEqual({
      ok: false,
      refusal: 'invalid'
    });
  });

  it.each([
    ['short', 'x'.repeat(9)],
    ['long', 'x'.repeat(129)],
    ['missing', undefined]
  ])('refuses a %s password', (_, password) => {
    expect(parseSignup({ ...valid, password })).toEqual({
      ok: false,
      refusal: 'password'
    });
  });

  it.each(['Not Valid', 'under_score', '-leading', 'pr-12', ''])(
    'refuses the deployment %p',
    (deployment) => {
      expect(parseSignup({ ...valid, deployment })).toEqual({
        ok: false,
        refusal: 'deployment'
      });
    }
  );

  it('defaults the locale to en and accepts sv', () => {
    const locale = (body: SignupBody) => {
      const result = parseSignup(body);
      return result.ok ? result.input.locale : null;
    };

    expect(locale(valid)).toBe('en');
    expect(locale({ ...valid, locale: 'fr' })).toBe('en');
    expect(locale({ ...valid, locale: 'sv' })).toBe('sv');
  });
});

describe('signupRefusal', () => {
  it.each([
    ['closed', 'closed'],
    ['throttled', 'throttled'],
    ['unknown', 'code'],
    ['expired', 'code'],
    ['exhausted', 'code']
  ] as const)(
    'answers an invite code that is %s with %s',
    (verdict, expected) => {
      expect(signupRefusal(new InviteCodeRefused(verdict))).toBe(expected);
    }
  );

  it.each([
    ['email', 'email-taken'],
    ['deployment', 'deployment-taken'],
    ['slug', 'name-taken']
  ] as const)('answers a violation on %s with %s', (path, expected) => {
    const error = new ValidationError({
      collection: 'tenants',
      errors: [{ path, message: 'Value must be unique' }]
    });

    expect(signupRefusal(error)).toBe(expected);
  });

  it('answers anything else with failed', () => {
    expect(signupRefusal(new Error('boom'))).toBe('failed');
    expect(signupRefusal('boom')).toBe('failed');
    expect(
      signupRefusal(
        new ValidationError({
          errors: [{ path: 'other', message: 'Invalid' }]
        })
      )
    ).toBe('failed');
  });

  it('has a status for each refusal it can answer with', () => {
    expect(REFUSAL_STATUS[signupRefusal(new InviteCodeRefused('closed'))]).toBe(
      403
    );
    expect(REFUSAL_STATUS[signupRefusal(new Error('boom'))]).toBe(500);
  });
});

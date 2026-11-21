import { InviteCodeRefused } from '@codeware/app-cms/data-access';
import { ValidationError } from 'payload';

import {
  REFUSAL_STATUS,
  type SignupBody,
  SiteTaken,
  isSiteTaken,
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
  siteName: 'Ada Engines'
};

describe('parseSignup', () => {
  it('accepts valid input, trimmed and with the email lowercased', () => {
    const result = parseSignup({
      ...valid,
      code: '  abcd-efgh ',
      name: ' Ada Lovelace ',
      email: '  Ada@Example.COM ',
      siteName: ' Ada Engines '
    });

    expect(result).toEqual({
      ok: true,
      input: { ...valid, deployment: 'ada-engines', locale: 'en' }
    });
  });

  it('derives the address from the site name and ignores a posted one', () => {
    const result = parseSignup({
      ...valid,
      siteName: 'Åsa Öström AB',
      deployment: 'other'
    });

    expect(result).toMatchObject({
      ok: true,
      input: { deployment: 'asa-ostrom-ab' }
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
    ['short', 'x'.repeat(11)],
    ['long', 'x'.repeat(129)],
    ['missing', undefined]
  ])('refuses a %s password', (_, password) => {
    expect(parseSignup({ ...valid, password })).toEqual({
      ok: false,
      refusal: 'password'
    });
  });

  it.each(['!!!', '---'])(
    'refuses the site name %p, which gives no usable address',
    (siteName) => {
      expect(parseSignup({ ...valid, siteName })).toEqual({
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

  it('answers a taken site by what clashed', () => {
    expect(signupRefusal(new SiteTaken('name'))).toBe('name-taken');
    expect(signupRefusal(new SiteTaken('address'))).toBe('deployment-taken');
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

describe('isSiteTaken', () => {
  const site = { name: 'Ada Engines', deployment: 'ada-engines' };

  const payloadWith = (totalDocs: number, names: string[]) => {
    const payload = {
      count: jest.fn().mockResolvedValue({ totalDocs }),
      find: jest
        .fn()
        .mockResolvedValue({ docs: names.map((name) => ({ name })) })
    };
    return payload as unknown as Parameters<typeof isSiteTaken>[0] &
      typeof payload;
  };

  it('is free when nothing answers to the name or the address', async () => {
    expect(await isSiteTaken(payloadWith(0, ['Other']), site)).toBeNull();
  });

  it('says address when a deployment or slug matches the derived address', async () => {
    const payload = payloadWith(1, []);

    expect(await isSiteTaken(payload, site)).toBe('address');
    expect(payload.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          or: [
            { deployment: { equals: 'ada-engines' } },
            { slug: { equals: 'ada-engines' } }
          ]
        }
      })
    );
    expect(payload.find).not.toHaveBeenCalled();
  });

  it('says name for the same name in any case and with spaces around it', async () => {
    expect(
      await isSiteTaken(payloadWith(0, ['  ADA engines ']), {
        name: ' ada ENGINES',
        deployment: 'ada-engines-2'
      })
    ).toBe('name');
  });

  it('does not take a name that only contains another', async () => {
    expect(
      await isSiteTaken(payloadWith(0, ['Ada Engines Ltd']), site)
    ).toBeNull();
  });

  it('finds the exact name among more than a hundred that contain it', async () => {
    const others = Array.from({ length: 150 }, (_, i) => `Ada Engines ${i}`);
    const payload = payloadWith(0, [...others, 'ada engines']);

    expect(await isSiteTaken(payload, site)).toBe('name');
    expect(payload.find).toHaveBeenCalledWith(
      expect.not.objectContaining({ limit: expect.anything() })
    );
  });

  it('reads inside the transaction it is given', async () => {
    const payload = payloadWith(0, []);

    await isSiteTaken(payload, site, { transactionID: 'tx' });

    expect(payload.count).toHaveBeenCalledWith(
      expect.objectContaining({ req: { transactionID: 'tx' } })
    );
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({ req: { transactionID: 'tx' } })
    );
  });
});

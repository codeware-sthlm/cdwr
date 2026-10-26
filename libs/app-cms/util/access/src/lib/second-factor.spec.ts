import type { UserAny } from '@codeware/shared/util/payload-types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isSecondFactorPending,
  isTotpSetupPending,
  mustEnrolTotp
} from './second-factor';

type Session = { _strategy?: string; hasTotp?: boolean };

const user = (
  role: 'user' | 'system-user',
  tenants: Array<{ tenant: number; role: 'reader' | 'user' | 'admin' }>,
  session: Session = {}
): UserAny => ({ id: 1, role, tenants, ...session }) as unknown as UserAny;

/** A tenant api key identity: not a User, no `role` or `tenants` */
const tenantApiKey = (session: Session = {}) =>
  ({
    id: 7,
    collection: 'tenants',
    slug: 'moon',
    ...session
  }) as unknown as UserAny;

const people: ReadonlyArray<{
  name: string;
  make: (session?: Session) => UserAny | null | undefined;
  mustEnrol: boolean;
}> = [
  { name: 'null', make: () => null, mustEnrol: false },
  { name: 'undefined', make: () => undefined, mustEnrol: false },
  { name: 'a tenant api key', make: tenantApiKey, mustEnrol: false },
  {
    name: 'a system user',
    make: (session) => user('system-user', [], session),
    mustEnrol: true
  },
  {
    name: 'a workspace admin',
    make: (session) => user('user', [{ tenant: 7, role: 'admin' }], session),
    mustEnrol: true
  },
  {
    name: 'a workspace admin among other roles',
    make: (session) =>
      user(
        'user',
        [
          { tenant: 8, role: 'reader' },
          { tenant: 7, role: 'admin' }
        ],
        session
      ),
    mustEnrol: true
  },
  {
    name: 'an editor',
    make: (session) => user('user', [{ tenant: 7, role: 'user' }], session),
    mustEnrol: false
  },
  {
    name: 'a reader',
    make: (session) => user('user', [{ tenant: 7, role: 'reader' }], session),
    mustEnrol: false
  },
  {
    name: 'a member of nothing',
    make: (session) => user('user', [], session),
    mustEnrol: false
  }
];

const strategies: ReadonlyArray<string | undefined> = [
  undefined,
  'local-jwt',
  'totp',
  'api-key'
];

describe('mustEnrolTotp', () => {
  it.each(people)('$name: $mustEnrol', ({ make, mustEnrol }) => {
    expect(mustEnrolTotp((make() ?? null) as UserAny | null)).toBe(mustEnrol);
  });
});

describe('isTotpSetupPending', () => {
  const cases = people.flatMap(({ name, make, mustEnrol }) =>
    strategies.flatMap((_strategy) =>
      [true, false].map((hasTotp) => ({
        name,
        make,
        _strategy,
        hasTotp,
        expected: mustEnrol && _strategy === 'local-jwt' && !hasTotp
      }))
    )
  );

  it.each(cases)(
    '$name, strategy $_strategy, hasTotp $hasTotp: $expected',
    ({ make, _strategy, hasTotp, expected }) => {
      expect(isTotpSetupPending(make({ _strategy, hasTotp }))).toBe(expected);
    }
  );

  it('leaves a user without the flag as not enrolled', () => {
    expect(
      isTotpSetupPending(user('system-user', [], { _strategy: 'local-jwt' }))
    ).toBe(true);
  });
});

describe('isSecondFactorPending', () => {
  const cases = people.flatMap(({ name, make, mustEnrol }) =>
    strategies.flatMap((_strategy) =>
      [true, false].map((hasTotp) => {
        const isRealUser = !['null', 'undefined', 'a tenant api key'].includes(
          name
        );
        const requestAuthenticated = _strategy === 'local-jwt';
        return {
          name,
          make,
          _strategy,
          hasTotp,
          expected:
            isRealUser &&
            requestAuthenticated &&
            (hasTotp || (mustEnrol && !hasTotp))
        };
      })
    )
  );

  it.each(cases)(
    '$name, strategy $_strategy, hasTotp $hasTotp: $expected',
    ({ make, _strategy, hasTotp, expected }) => {
      expect(isSecondFactorPending(make({ _strategy, hasTotp }))).toBe(
        expected
      );
    }
  );

  it('holds back an enrolled member until a code is entered', () => {
    expect(
      isSecondFactorPending(
        user('user', [{ tenant: 7, role: 'user' }], {
          _strategy: 'local-jwt',
          hasTotp: true
        })
      )
    ).toBe(true);
  });
});

describe('seeded user exemption', () => {
  const seeded = (email: string) =>
    ({
      id: 1,
      email,
      role: 'system-user',
      tenants: [],
      _strategy: 'local-jwt'
    }) as unknown as UserAny;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    { flag: undefined, email: 'system@local.dev', mustEnrol: true },
    { flag: 'false', email: 'system@local.dev', mustEnrol: true },
    { flag: 'true', email: 'system@local.dev', mustEnrol: false },
    { flag: 'true', email: 'admin@codeware.se', mustEnrol: true }
  ])(
    'flag $flag, $email: must enrol $mustEnrol',
    ({ flag, email, mustEnrol }) => {
      if (flag !== undefined) {
        vi.stubEnv('TOTP_EXEMPT_SEEDED_USERS', flag);
      }
      expect(mustEnrolTotp(seeded(email))).toBe(mustEnrol);
      expect(isTotpSetupPending(seeded(email))).toBe(mustEnrol);
    }
  );
});

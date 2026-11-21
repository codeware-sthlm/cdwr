import type { ClientSecret } from '../../services/infisical-identity';
import { CATALOG } from '../secrets/catalog';

import {
  IDENTITY_TARGETS,
  INFISICAL_ROTATIONS,
  claimsOf,
  describeSecret,
  descriptionOf,
  toRevoke
} from './rotate-infisical.logic';

const secret = (
  id: string,
  extra: Partial<ClientSecret> = {}
): ClientSecret => ({
  id,
  description: '',
  clientSecretPrefix: 'abcd',
  createdAt: '2026-01-02T03:04:05.000Z',
  clientSecretTTL: 0,
  isClientSecretRevoked: false,
  ...extra
});

const token = (payload: unknown, header = '{"alg":"HS256"}') =>
  [header, JSON.stringify(payload), 'signature']
    .map((part) => Buffer.from(part).toString('base64url'))
    .join('.');

describe('INFISICAL_ROTATIONS', () => {
  it('lists both targets', () => {
    expect(IDENTITY_TARGETS).toEqual(['platform', 'desk']);
  });

  it('covers exactly the catalog secrets rotated by this command', () => {
    const keys = CATALOG.filter(
      (entry) =>
        entry.kind !== 'setting' &&
        'command' in entry.rotation &&
        entry.rotation.command.join(' ') === 'agent rotate infisical'
    ).map((entry) => entry.key);
    expect(keys.sort()).toEqual(
      Object.values(INFISICAL_ROTATIONS)
        .map((rotation) => rotation.clientSecret)
        .sort()
    );
  });
});

describe('descriptionOf', () => {
  it('names the key', () => {
    expect(descriptionOf('DESK_INFISICAL_CLIENT_SECRET')).toBe(
      'cdwr: DESK_INFISICAL_CLIENT_SECRET'
    );
  });
});

describe('claimsOf', () => {
  it('reads the identity and client secret', () => {
    expect(
      claimsOf(token({ identityId: 'i-1', clientSecretId: 's-1', other: 1 }))
    ).toEqual({ identityId: 'i-1', clientSecretId: 's-1' });
  });

  const bad = {
    'a missing clientSecretId': token({ identityId: 'i-1' }),
    'a missing identityId': token({ clientSecretId: 's-1' }),
    'two parts': 'aaa.bbb',
    'four parts': 'aaa.bbb.ccc.ddd',
    'a payload that is not json': `h.${Buffer.from('not json').toString('base64url')}.s`,
    'a payload that is not an object': token('text')
  };

  it.each(Object.entries(bad))('rejects %s', (_name, value) => {
    expect(() => claimsOf(value)).toThrow(
      'The access token is not a universal-auth token'
    );
  });

  it('never puts the token or its payload in the error', () => {
    const value = token({ identityId: 'secret-identity' });
    const message = (() => {
      try {
        claimsOf(value);
      } catch (error) {
        return (error as Error).message;
      }
      return '';
    })();
    expect(message).not.toBe('');
    for (const part of value.split('.')) expect(message).not.toContain(part);
    expect(message).not.toContain('secret-identity');
  });
});

describe('toRevoke', () => {
  const key = 'PLATFORM_INFISICAL_CLIENT_SECRET';
  const mine = descriptionOf(key);

  it('revokes the old secret and earlier leftovers, never the kept one', () => {
    const secrets = [
      secret('old', { description: 'hand made' }),
      secret('left', { description: mine }),
      secret('new', { description: mine }),
      secret('other', { description: 'someone else' })
    ];
    const result = toRevoke(secrets, { keep: 'new', old: 'old', key });
    expect(result.revoke.map((s) => s.id)).toEqual(['old', 'left']);
    expect(result.others.map((s) => s.id)).toEqual(['other']);
  });

  it('leaves everything else alone without an old id', () => {
    const secrets = [secret('a'), secret('new', { description: mine })];
    const result = toRevoke(secrets, { keep: 'new', key });
    expect(result.revoke).toEqual([]);
    expect(result.others.map((s) => s.id)).toEqual(['a']);
  });

  it('ignores revoked secrets', () => {
    const secrets = [
      secret('old', { isClientSecretRevoked: true }),
      secret('left', { description: mine, isClientSecretRevoked: true }),
      secret('gone', { isClientSecretRevoked: true })
    ];
    expect(toRevoke(secrets, { keep: 'new', old: 'old', key })).toEqual({
      revoke: [],
      others: []
    });
  });
});

describe('describeSecret', () => {
  it('shows the expiry as creation plus the ttl', () => {
    expect(
      describeSecret(
        secret('a', { description: 'ci', clientSecretTTL: 31_536_000 })
      )
    ).toBe('abcd… "ci", created 2026-01-02, expires 2027-01-02');
  });

  it('says never expires for a ttl of 0', () => {
    expect(describeSecret(secret('a', { description: 'ci' }))).toBe(
      'abcd… "ci", created 2026-01-02, never expires'
    );
  });
});

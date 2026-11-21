import { parseFlyTokens, tokenExpiryByName } from './fly';

const OUTPUT = `Tokens for organization "codeware":
 ID                                         │ NAME               │ CREATED BY                 │ EXPIRES AT                    │ REVOKED AT                    
 APJqJeOaDBVgOH3KYjRMemYvLQHAa8VRQnYZZbDfBX │ Desk org token     │ hakan.stroberg@codeware.se │ 2046-11-11 06:47:50 +0000 UTC │                               
 0wj3jnOmeLlyOiG9w7x0Azwlm6HML8Q37ymLePnSl  │ Organization Token │ hakan.stroberg@codeware.se │ 2126-10-22 18:33:10 +0000 UTC │ 2026-11-15 18:34:33 +0000 UTC 
 ekGjGeobam35oIV8p3oNJnpqY0Cl11VA90VYPaRCwa │ Org deploy token   │ hakan.stroberg@codeware.se │ 2044-12-06 12:29:01 +0000 UTC │                               
 ywyeyxmbMoZVmi8G5qznka5lOvs400ZlgJZz8o2uGm │ Org deploy token   │ hakan.stroberg@codeware.se │ 2044-12-06 12:24:44 +0000 UTC │ 2024-12-11 12:28:51 +0000 UTC 
`;

describe('parseFlyTokens', () => {
  it('parses rows to ISO and skips the title and header', () => {
    const tokens = parseFlyTokens(OUTPUT);
    expect(tokens).toHaveLength(4);
    expect(tokens[0]).toEqual({
      id: 'APJqJeOaDBVgOH3KYjRMemYvLQHAa8VRQnYZZbDfBX',
      name: 'Desk org token',
      expiresAt: '2046-11-11T06:47:50Z'
    });
    expect(tokens[1]?.revokedAt).toBe('2026-11-15T18:34:33Z');
  });

  it('skips rows it cannot parse', () => {
    expect(parseFlyTokens('')).toEqual([]);
    expect(parseFlyTokens(' a │ b │ c │ soon │ \nno table here')).toEqual([]);
  });
});

describe('tokenExpiryByName', () => {
  const tokens = parseFlyTokens(OUTPUT);
  const now = new Date('2026-11-21T00:00:00Z');

  it('finds a live token', () => {
    expect(tokenExpiryByName(tokens, 'Desk org token', now)).toEqual({
      state: 'found',
      expiresAt: '2046-11-11T06:47:50Z'
    });
  });

  it('ignores revoked tokens, also when they share a name with a live one', () => {
    expect(tokenExpiryByName(tokens, 'Org deploy token', now)).toEqual({
      state: 'found',
      expiresAt: '2044-12-06T12:29:01Z'
    });
  });

  it('is missing when only revoked tokens or none match', () => {
    expect(tokenExpiryByName(tokens, 'Organization Token', now)).toEqual({
      state: 'missing'
    });
    expect(tokenExpiryByName(tokens, 'Nope', now)).toEqual({
      state: 'missing'
    });
  });

  it('is ambiguous when two unexpired tokens share a name', () => {
    const twice = [
      { id: '1', name: 'Same', expiresAt: '2040-01-01T00:00:00Z' },
      { id: '2', name: 'Same', expiresAt: '2041-01-01T00:00:00Z' }
    ];
    expect(tokenExpiryByName(twice, 'Same', now)).toEqual({
      state: 'ambiguous'
    });
  });

  it('prefers the unexpired token over an expired one', () => {
    const rotated = [
      { id: '1', name: 'Same', expiresAt: '2026-01-01T00:00:00Z' },
      { id: '2', name: 'Same', expiresAt: '2041-01-01T00:00:00Z' }
    ];
    expect(tokenExpiryByName(rotated, 'Same', now)).toEqual({
      state: 'found',
      expiresAt: '2041-01-01T00:00:00Z'
    });
  });

  it('is expired when the only live token has lapsed', () => {
    const lapsed = [
      { id: '1', name: 'Same', expiresAt: '2026-01-01T00:00:00Z' }
    ];
    expect(tokenExpiryByName(lapsed, 'Same', now)).toEqual({
      state: 'expired',
      expiresAt: '2026-01-01T00:00:00Z'
    });
  });

  it('is ambiguous when several live tokens have all lapsed', () => {
    const lapsed = [
      { id: '1', name: 'Same', expiresAt: '2026-01-01T00:00:00Z' },
      { id: '2', name: 'Same', expiresAt: '2026-02-01T00:00:00Z' }
    ];
    expect(tokenExpiryByName(lapsed, 'Same', now)).toEqual({
      state: 'ambiguous'
    });
  });
});

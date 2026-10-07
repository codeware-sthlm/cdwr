import { resolveKeys } from './resolve.logic';

describe('resolveKeys', () => {
  const vault = {
    DATABASE_URL: 'postgres://vault-value',
    PAYLOAD_SECRET_KEY: 'vault-secret-value',
    LOG_LEVEL: 'debug-from-vault'
  };

  it('names the layer each vault key comes from, sorted', () => {
    const rows = resolveKeys({
      inherited: {
        DATABASE_URL: 'postgres://local-override',
        PAYLOAD_SECRET_KEY: 'secret'
      },
      committed: { PAYLOAD_SECRET_KEY: 'secret' },
      vault
    });
    expect(rows.map(({ key, source }) => [key, source])).toEqual([
      ['DATABASE_URL', 'inherited'],
      ['LOG_LEVEL', 'vault'],
      ['PAYLOAD_SECRET_KEY', 'vault over committed']
    ]);
  });

  it('returns only keys and sources, never a value', () => {
    const rows = resolveKeys({
      inherited: { DATABASE_URL: 'postgres://local-override' },
      committed: {},
      vault
    });
    expect(rows.every((row) => Object.keys(row).length === 2)).toBe(true);
    const text = JSON.stringify(rows);
    expect(text).not.toContain('vault-secret-value');
    expect(text).not.toContain('postgres://local-override');
    expect(text).not.toContain('postgres://vault-value');
  });
});

import { keyHeaders, serviceKey } from './keys';

const envOf =
  (vars: Record<string, string>) =>
  (name: string): string | undefined =>
    vars[name];

describe('serviceKey', () => {
  it('prefers the default entry of SUPABASE_SECRET_KEYS', () => {
    const env = envOf({
      SUPABASE_SECRET_KEYS: '{"default":"sb_secret_new","other":"sb_secret_x"}',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJlegacy'
    });
    expect(serviceKey(env)).toBe('sb_secret_new');
  });

  it('falls back to the legacy key when there is no secret keys entry', () => {
    expect(
      serviceKey(
        envOf({
          SUPABASE_SECRET_KEYS: '{"other":"sb_secret_x"}',
          SUPABASE_SERVICE_ROLE_KEY: 'eyJlegacy'
        })
      )
    ).toBe('eyJlegacy');
    expect(serviceKey(envOf({ SUPABASE_SERVICE_ROLE_KEY: 'eyJlegacy' }))).toBe(
      'eyJlegacy'
    );
  });

  it.each(['not json', 'null', '[]', '{"default":5}', ''])(
    'ignores SUPABASE_SECRET_KEYS %j',
    (raw) => {
      const env = envOf({
        SUPABASE_SECRET_KEYS: raw,
        SUPABASE_SERVICE_ROLE_KEY: 'eyJlegacy'
      });
      expect(serviceKey(env)).toBe('eyJlegacy');
    }
  );

  it('is undefined when neither is set', () => {
    expect(serviceKey(envOf({}))).toBeUndefined();
  });
});

describe('keyHeaders', () => {
  it('sends a legacy JWT key as apikey and Bearer', () => {
    expect(keyHeaders('eyJabc')).toEqual({
      apikey: 'eyJabc',
      Authorization: 'Bearer eyJabc'
    });
  });

  it('sends an sb_secret_ key as apikey alone', () => {
    expect(keyHeaders('sb_secret_x')).toEqual({ apikey: 'sb_secret_x' });
  });
});

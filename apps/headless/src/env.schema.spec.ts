import { EnvSchema } from './env.schema';

const valid = {
  PAYLOAD_URL: 'http://localhost:3000',
  PAYLOAD_API_KEY: 'secret',
  SIGNATURE_SECRET: 'signing',
  TENANT_ID: 'moon'
};

describe('EnvSchema', () => {
  it('accepts a complete environment', () => {
    expect(EnvSchema.parse(valid)).toEqual({
      ...valid,
      DEPLOY_ENV: 'development',
      CSP_ENFORCE: false,
      DEBUG: false
    });
  });

  it.each([
    'PAYLOAD_URL',
    'PAYLOAD_API_KEY',
    'SIGNATURE_SECRET',
    'TENANT_ID'
  ] as const)('requires %s', (key) => {
    const { [key]: _omitted, ...rest } = valid;
    expect(EnvSchema.safeParse(rest).success).toBe(false);
  });

  it('takes the optional statistics, font and Fly settings', () => {
    expect(
      EnvSchema.parse({
        ...valid,
        UMAMI_URL: 'https://umami.example',
        FONT_ASSETS_BASE_URL: 'https://fonts.example',
        RESTRICTED_FONTS: 'sohne',
        FLY_APP_NAME: 'cdwr-headless-moon'
      })
    ).toMatchObject({
      UMAMI_URL: 'https://umami.example',
      FONT_ASSETS_BASE_URL: 'https://fonts.example',
      RESTRICTED_FONTS: 'sohne',
      FLY_APP_NAME: 'cdwr-headless-moon'
    });
    expect(
      EnvSchema.safeParse({ ...valid, UMAMI_URL: 'not a url' }).success
    ).toBe(false);
  });

  it('rejects a malformed url', () => {
    expect(
      EnvSchema.safeParse({ ...valid, PAYLOAD_URL: 'not a url' }).success
    ).toBe(false);
  });

  it('refuses a site gate password under 8 characters', () => {
    expect(
      EnvSchema.safeParse({ ...valid, SITE_GATE_PASSWORD: '1234567' }).success
    ).toBe(false);
  });

  it('accepts a site gate password of 8 characters', () => {
    expect(
      EnvSchema.parse({ ...valid, SITE_GATE_PASSWORD: '12345678' })
        .SITE_GATE_PASSWORD
    ).toBe('12345678');
  });

  it('treats a blank site gate password as unset', () => {
    expect(
      EnvSchema.parse({ ...valid, SITE_GATE_PASSWORD: '' }).SITE_GATE_PASSWORD
    ).toBeUndefined();
  });
});

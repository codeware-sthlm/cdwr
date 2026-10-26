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

  it('rejects a malformed url', () => {
    expect(
      EnvSchema.safeParse({ ...valid, PAYLOAD_URL: 'not a url' }).success
    ).toBe(false);
  });
});

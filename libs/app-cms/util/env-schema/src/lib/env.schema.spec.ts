import { EnvSchema } from './env.schema';

const base = {
  APP_NAME: 'cms',
  DEPLOY_ENV: 'development',
  FLY_URL: 'http://localhost:3000',
  PR_NUMBER: '1',
  DATABASE_URL: 'postgres://localhost:5432/cms',
  DATABASE_SCHEMA: 'public',
  PAYLOAD_SECRET_KEY: 'secret',
  SIGNATURE_SECRET: 'signature'
};

const parse = (env: Record<string, unknown>) =>
  EnvSchema.safeParse({ ...base, ...env });

const issuePaths = (env: Record<string, unknown>) => {
  const result = parse(env);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
};

describe('EnvSchema', () => {
  describe('SEED_PASSWORD', () => {
    it('refuses a password under 12 characters', () => {
      expect(issuePaths({ SEED_PASSWORD: '12345678901' })).toContain(
        'SEED_PASSWORD'
      );
    });

    it('accepts a password of 12 characters', () => {
      expect(parse({ SEED_PASSWORD: '123456789012' }).success).toBe(true);
    });

    it('accepts none', () => {
      expect(parse({}).success).toBe(true);
    });

    it('takes a blank value as none', () => {
      const result = parse({ SEED_PASSWORD: '' });
      expect(result.success && result.data.SEED_PASSWORD).toBeUndefined();
    });

    it('does not let a blank value unlock the preview exemption', () => {
      expect(
        parse({
          DEPLOY_ENV: 'preview',
          SEED_PASSWORD: '',
          TOTP_EXEMPT_SEEDED_USERS: 'true'
        }).success
      ).toBe(false);
    });
  });

  describe('TOTP_EXEMPT_SEEDED_USERS', () => {
    const exempt = { TOTP_EXEMPT_SEEDED_USERS: 'true' };
    const password = { SEED_PASSWORD: 'a-long-enough-secret' };

    it('is allowed in development', () => {
      expect(parse({ ...exempt, DEPLOY_ENV: 'development' }).success).toBe(
        true
      );
    });

    it('is refused in preview without SEED_PASSWORD', () => {
      expect(issuePaths({ ...exempt, DEPLOY_ENV: 'preview' })).toEqual([
        'TOTP_EXEMPT_SEEDED_USERS'
      ]);
    });

    it('is allowed in preview with SEED_PASSWORD', () => {
      expect(
        parse({ ...exempt, ...password, DEPLOY_ENV: 'preview' }).success
      ).toBe(true);
    });

    it.each([{ SEED_SOURCE: 'off' }, { SEED_STRATEGY: 'once' }])(
      'is refused in preview when the seed may not run (%o)',
      (seed) => {
        expect(
          issuePaths({ ...exempt, ...password, ...seed, DEPLOY_ENV: 'preview' })
        ).toEqual(['TOTP_EXEMPT_SEEDED_USERS']);
      }
    );

    it('is refused in production, SEED_PASSWORD or not', () => {
      expect(issuePaths({ ...exempt, DEPLOY_ENV: 'production' })).toEqual([
        'TOTP_EXEMPT_SEEDED_USERS'
      ]);
      expect(
        issuePaths({ ...exempt, ...password, DEPLOY_ENV: 'production' })
      ).toEqual(['TOTP_EXEMPT_SEEDED_USERS']);
    });

    it.each(['development', 'preview', 'production'])(
      'off is fine in %s',
      (DEPLOY_ENV) => {
        expect(
          parse({ TOTP_EXEMPT_SEEDED_USERS: 'false', DEPLOY_ENV }).success
        ).toBe(true);
        expect(parse({ DEPLOY_ENV }).success).toBe(true);
      }
    );
  });

  describe('Turnstile', () => {
    it('keeps the source of a half pair for the boot warning', () => {
      const result = parse({
        TURNSTILE_SITE_KEY: 'site',
        HUMAN_CHECK_SOURCE: '/tenants/moon'
      });
      expect(result.success && result.data).toMatchObject({
        HUMAN_CHECK: undefined,
        HUMAN_CHECK_MISSING: 'TURNSTILE_SECRET_KEY',
        HUMAN_CHECK_SOURCE: '/tenants/moon'
      });
    });
  });
});

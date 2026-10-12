import { getSiteSettingsForTenant } from '@codeware/app-cms/data-access';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { PLATFORM_EMAIL_BRAND } from '@codeware/app-cms/util/email';
import type { PayloadRequest } from 'payload';

import { resolveScopedTenant } from '../../security/resolve-scoped-tenant';

import { forgotPasswordMail } from './forgot-password-email';

// The email barrel reaches the ESM-only mail transport, which the render path never uses
jest.mock('@payloadcms/email-nodemailer', () => ({}));
jest.mock('nodemailer', () => ({}));
jest.mock('@sentry/nextjs', () => ({}));
jest.mock('@codeware/app-cms/data-access', () => ({
  getSiteSettingsForTenant: jest.fn()
}));
jest.mock('@codeware/app-cms/feature/env-loader', () => ({
  getEnv: jest.fn()
}));
jest.mock('../../security/resolve-scoped-tenant', () => ({
  resolveScopedTenant: jest.fn()
}));

const fetchSettings = jest.mocked(getSiteSettingsForTenant);
const env = jest.mocked(getEnv);
const scopedTenant = jest.mocked(resolveScopedTenant);

const settings = (defaultLocale: string) =>
  ({
    general: {
      appName: 'Titan Tours',
      defaultLocale,
      defaultTheme: 'unknown',
      icon: { source: 'svg', svgCode: '<svg/>' }
    }
  }) as unknown as NonNullable<Awaited<ReturnType<typeof fetchSettings>>>;

const mode = (type: 'host' | 'tenant') =>
  env.mockReturnValue({ APP_MODE: { type } } as unknown as ReturnType<
    typeof getEnv
  >);

const request = (language: string, serverURL = 'https://titan.example') => {
  const warn = jest.fn();
  const error = jest.fn();
  const req = {
    i18n: { language },
    origin: 'https://attacker.example',
    payload: {
      logger: { warn, error },
      config: {
        serverURL,
        routes: { admin: '/admin' },
        admin: { routes: { reset: '/reset' } }
      }
    }
  } as unknown as PayloadRequest;
  return { req, warn, error };
};

const user = { name: 'Ada' };

beforeEach(() => {
  jest.resetAllMocks();
  scopedTenant.mockResolvedValue({ id: 7 } as never);
});

describe('forgotPasswordMail', () => {
  it('brands a tenant mail and links to the reset page', async () => {
    mode('tenant');
    fetchSettings.mockResolvedValue(settings('sv'));
    const { req } = request('en');

    const mail = await forgotPasswordMail({ req, token: 'abc', user });

    expect(fetchSettings).toHaveBeenCalledWith(req.payload, 7, { depth: 1 });
    expect(mail.html).toContain('Titan Tours');
    expect(mail.html).toContain('https://titan.example/admin/reset/abc');
    expect(mail.html).toContain('https://titan.example/site-icon.png?size=64');
  });

  it('uses the platform brand in host mode without reading settings', async () => {
    mode('host');
    const { req } = request('en');

    const mail = await forgotPasswordMail({ req, token: 'abc', user });

    expect(fetchSettings).not.toHaveBeenCalled();
    expect(mail.html).toContain(PLATFORM_EMAIL_BRAND.name);
  });

  it('falls back to the tenant locale when the language is unsupported', async () => {
    mode('tenant');
    fetchSettings.mockResolvedValue(settings('sv'));
    const sv = await forgotPasswordMail({
      req: request('de').req,
      token: 't',
      user
    });
    const en = await forgotPasswordMail({
      req: request('en').req,
      token: 't',
      user
    });

    expect(sv.subject).not.toBe(en.subject);
  });

  it('falls back to English when neither locale is supported', async () => {
    mode('tenant');
    fetchSettings.mockResolvedValue(settings('de'));
    const fallback = await forgotPasswordMail({
      req: request('de').req,
      token: 't',
      user
    });
    const en = await forgotPasswordMail({
      req: request('en').req,
      token: 't',
      user
    });

    expect(fallback.subject).toBe(en.subject);
  });

  it('uses the platform brand and warns when settings cannot be read', async () => {
    mode('tenant');
    fetchSettings.mockRejectedValue(new Error('db down'));
    const { req, warn } = request('en');

    const mail = await forgotPasswordMail({ req, token: 'abc', user });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(mail.html).toContain(PLATFORM_EMAIL_BRAND.name);
    expect(mail.html).toContain('https://titan.example/admin/reset/abc');
  });

  it('builds once per request for the html and the subject', async () => {
    mode('tenant');
    fetchSettings.mockResolvedValue(settings('en'));
    const { req } = request('en');

    const [a, b] = await Promise.all([
      forgotPasswordMail({ req, token: 'abc', user }),
      forgotPasswordMail({ req, token: 'abc', user })
    ]);

    expect(a).toBe(b);
    expect(fetchSettings).toHaveBeenCalledTimes(1);
  });

  it('never builds the link from the request origin', async () => {
    mode('host');
    const { req, error } = request('en', '');

    const mail = await forgotPasswordMail({ req, token: 'abc', user });

    expect(mail.html).not.toContain('attacker.example');
    expect(mail.html).toContain('/admin/reset/abc');
    expect(error).toHaveBeenCalled();
  });
  it('joins a serverURL with a trailing slash without a double slash', async () => {
    mode('host');
    const { req } = request('en', 'https://titan.example/');

    const mail = await forgotPasswordMail({ req, token: 'abc', user });

    expect(mail.html).toContain('https://titan.example/admin/reset/abc');
  });
});

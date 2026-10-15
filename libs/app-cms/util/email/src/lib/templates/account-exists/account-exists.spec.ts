import { describe, expect, it } from 'vitest';

import { PLATFORM_EMAIL_BRAND } from '../../email-brand';

import { renderAccountExistsMail } from './account-exists';

const base = {
  locale: 'en' as const,
  brand: PLATFORM_EMAIL_BRAND,
  loginUrl: 'https://cms.example.com/admin/login',
  resetUrl: 'https://cms.example.com/admin/forgot'
};

describe('renderAccountExistsMail', () => {
  it('renders in English without a greeting', () => {
    const mail = renderAccountExistsMail(base);

    expect(mail.subject).toBe('You already have an account');
    expect(mail.text).toContain('You already have an account');
    expect(mail.text).toContain("If it wasn't you");
    expect(mail.text).not.toMatch(/^Hi/m);
  });

  it('renders in Swedish', () => {
    const mail = renderAccountExistsMail({ ...base, locale: 'sv' });

    expect(mail.subject).toBe('Du har redan ett konto');
    expect(mail.text).toContain('Om det inte var du');
    expect(mail.text).not.toMatch(/^Hej/m);
  });

  it('links to sign in and to the password reset', () => {
    const mail = renderAccountExistsMail(base);

    expect(mail.html).toContain(`href="${base.loginUrl}"`);
    expect(mail.html).toContain(`href="${base.resetUrl}"`);
    expect(mail.text).toContain(`Sign in: ${base.loginUrl}`);
    expect(mail.text).toContain(`Reset your password: ${base.resetUrl}`);
  });
});

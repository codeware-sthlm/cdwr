import { describe, expect, it } from 'vitest';

import { PLATFORM_EMAIL_BRAND } from '../../email-brand';

import { renderForgotPasswordMail } from './forgot-password';

const base = {
  locale: 'en' as const,
  brand: { name: 'Titan Tours', accent: '#8a1c1c' },
  resetUrl: 'https://titan.example.com/admin/reset/abc123',
  name: 'Anna Berg'
};

describe('renderForgotPasswordMail', () => {
  it('renders in English', () => {
    const mail = renderForgotPasswordMail(base);

    expect(mail.subject).toBe('Reset your password');
    expect(mail.text).toContain('Hi Anna Berg,');
    expect(mail.text).toContain('your account at Titan Tours');
    expect(mail.text).toContain('Your password stays unchanged');
  });

  it('renders in Swedish', () => {
    const mail = renderForgotPasswordMail({ ...base, locale: 'sv' });

    expect(mail.subject).toBe('Återställ ditt lösenord');
    expect(mail.text).toContain('Hej Anna Berg,');
    expect(mail.text).toContain('Välj ett nytt lösenord');
  });

  it('puts the reset url in the button, the fallback and the text', () => {
    const mail = renderForgotPasswordMail(base);

    expect(mail.html).toContain(`href="${base.resetUrl}"`);
    expect(mail.html).toContain(`>${base.resetUrl}</a>`);
    expect(mail.text).toContain(`Choose a new password: ${base.resetUrl}`);
  });

  it('escapes the name', () => {
    const mail = renderForgotPasswordMail({
      ...base,
      name: '<script>alert(1)</script>'
    });

    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('greets without a name when there is none', () => {
    const mail = renderForgotPasswordMail({ ...base, name: undefined });

    expect(mail.text).toContain('Hi,');
    expect(mail.text).not.toContain('Hi ');
  });

  it('takes the platform brand too', () => {
    const mail = renderForgotPasswordMail({
      ...base,
      brand: PLATFORM_EMAIL_BRAND
    });

    expect(mail.text).toContain('your account at Codeware CMS');
  });
});

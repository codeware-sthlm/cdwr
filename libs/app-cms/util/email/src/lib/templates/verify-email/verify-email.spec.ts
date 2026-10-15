import { describe, expect, it } from 'vitest';

import { PLATFORM_EMAIL_BRAND } from '../../email-brand';

import { renderVerifyEmailMail } from './verify-email';

const base = {
  locale: 'en' as const,
  brand: PLATFORM_EMAIL_BRAND,
  verifyUrl: 'https://cms.example.com/admin/verify/abc123',
  name: 'Anna Berg'
};

describe('renderVerifyEmailMail', () => {
  it('renders in English', () => {
    const mail = renderVerifyEmailMail(base);

    expect(mail.subject).toBe('Confirm your email address');
    expect(mail.text).toContain('Hi Anna Berg,');
    expect(mail.text).toContain('you can sign in');
    expect(mail.text).toContain('If you did not sign up');
  });

  it('renders in Swedish', () => {
    const mail = renderVerifyEmailMail({ ...base, locale: 'sv' });

    expect(mail.subject).toBe('Bekräfta din e-postadress');
    expect(mail.text).toContain('Hej Anna Berg,');
    expect(mail.text).toContain('Välkommen');
  });

  it('puts the verify url in the button, the fallback and the text', () => {
    const mail = renderVerifyEmailMail(base);

    expect(mail.html).toContain(`href="${base.verifyUrl}"`);
    expect(mail.html).toContain(`>${base.verifyUrl}</a>`);
    expect(mail.text).toContain(
      `Confirm your email address: ${base.verifyUrl}`
    );
  });

  it('escapes the name', () => {
    const mail = renderVerifyEmailMail({
      ...base,
      name: '<script>alert(1)</script>'
    });

    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('greets without a name when there is none', () => {
    const mail = renderVerifyEmailMail({ ...base, name: undefined });

    expect(mail.text).toContain('Hi,');
    expect(mail.text).not.toContain('Hi ');
  });
});

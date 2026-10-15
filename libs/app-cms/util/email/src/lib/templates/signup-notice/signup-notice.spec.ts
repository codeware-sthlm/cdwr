import { describe, expect, it } from 'vitest';

import { renderSignupNoticeMail } from './signup-notice';

const base = {
  locale: 'en' as const,
  tenantName: 'Titan Tours',
  deployment: 'cdwr-cms-titan',
  userName: 'Anna Berg',
  userEmail: 'anna@example.com',
  adminUrl: 'https://cms.example.com/admin/collections/tenants/1'
};

describe('renderSignupNoticeMail', () => {
  it('names the workspace in the subject', () => {
    const mail = renderSignupNoticeMail(base);

    expect(mail.subject).toBe('New self-serve signup: Titan Tours');
  });

  it('lists the details and the admin link', () => {
    const mail = renderSignupNoticeMail(base);

    for (const value of [
      base.tenantName,
      base.deployment,
      base.userName,
      base.userEmail
    ]) {
      expect(mail.text).toContain(value);
      expect(mail.html).toContain(value);
    }
    expect(mail.html).toContain(`href="${base.adminUrl}"`);
    expect(mail.text).toContain(base.adminUrl);
  });

  it('renders in Swedish', () => {
    const mail = renderSignupNoticeMail({ ...base, locale: 'sv' });

    expect(mail.subject).toBe('Ny självregistrering: Titan Tours');
  });

  it('escapes user-provided values', () => {
    const mail = renderSignupNoticeMail({
      ...base,
      tenantName: '<script>alert(1)</script>',
      userName: '<script>alert(2)</script>'
    });

    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});

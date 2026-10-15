import { describe, expect, it } from 'vitest';

import { renderSignupNoticeMail } from './signup-notice';

const base = {
  locale: 'en' as const,
  tenantName: 'Titan Tours',
  deployment: 'cdwr-cms-titan',
  environment: 'production' as const,
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

  it('names the provision command for the deployment', () => {
    const mail = renderSignupNoticeMail(base);
    const command =
      'cdwr tenant provision --env production --workspace cdwr-cms-titan --apps cms';

    expect(mail.text).toContain(`To take it live, run: ${command}`);
    expect(mail.html).toContain(command);
  });

  it('provisions in preview outside production', () => {
    const mail = renderSignupNoticeMail({ ...base, environment: 'preview' });

    expect(mail.text).toContain(
      'cdwr tenant provision --env preview --workspace cdwr-cms-titan --apps cms'
    );
  });

  it('renders in Swedish', () => {
    const mail = renderSignupNoticeMail({ ...base, locale: 'sv' });

    expect(mail.subject).toBe('Ny självregistrering: Titan Tours');
    expect(mail.text).toContain('Kör detta för att sätta den i drift: cdwr');
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

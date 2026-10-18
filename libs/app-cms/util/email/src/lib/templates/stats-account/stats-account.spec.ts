import { describe, expect, it } from 'vitest';

import { PLATFORM_EMAIL_BRAND } from '../../email-brand';

import { renderStatsAccountMail } from './stats-account';

const base = {
  locale: 'en' as const,
  brand: { name: 'Titan Tours', accent: '#8a1c1c' },
  loginUrl: 'https://stats.example.com/login',
  username: 'anna@titan.example.com',
  password: 'k3Jx9-pQ'
};

describe('renderStatsAccountMail', () => {
  it('renders in English', () => {
    const mail = renderStatsAccountMail(base);

    expect(mail.subject).toBe('Your statistics login');
    expect(mail.text).toContain('statistics for Titan Tours');
    expect(mail.text).toContain('Username: anna@titan.example.com');
    expect(mail.text).toContain('Password: k3Jx9-pQ');
    expect(mail.text).toContain('Change the password under your profile');
  });

  it('renders in Swedish', () => {
    const mail = renderStatsAccountMail({ ...base, locale: 'sv' });

    expect(mail.subject).toBe('Din inloggning till statistiken');
    expect(mail.text).toContain('Användarnamn: anna@titan.example.com');
    expect(mail.text).toContain('Lösenord: k3Jx9-pQ');
    expect(mail.text).toContain(
      'Byt lösenord under din profil i Umami när du har loggat in.'
    );
  });

  it('links to the login page in the button, the fallback and the text', () => {
    const mail = renderStatsAccountMail(base);

    expect(mail.html).toContain(`href="${base.loginUrl}"`);
    expect(mail.html).toContain(`>${base.loginUrl}</a>`);
    expect(mail.text).toContain(`Log in: ${base.loginUrl}`);
  });

  it('sets the password in a monospace block', () => {
    const mail = renderStatsAccountMail(base);

    expect(mail.html).toMatch(/monospace[^>]*>k3Jx9-pQ<\/p>/);
  });

  it('escapes the password and the username', () => {
    const mail = renderStatsAccountMail({
      ...base,
      username: '<b>a</b>@x.test',
      password: '<script>1</script>'
    });

    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<b>a</b>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('takes the platform brand too', () => {
    const mail = renderStatsAccountMail({
      ...base,
      brand: PLATFORM_EMAIL_BRAND
    });

    expect(mail.text).toContain('statistics for Codeware CMS');
  });
});

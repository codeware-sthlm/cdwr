import { describe, expect, it } from 'vitest';

import { PLATFORM_EMAIL_BRAND } from '../../email-brand';

import { renderIdleWorkspaceWarningMail } from './idle-workspace-warning';

const base = {
  locale: 'en' as const,
  workspaceName: 'Titan Tours',
  deleteOn: new Date('2026-11-01T03:00:00.000Z'),
  brand: PLATFORM_EMAIL_BRAND,
  adminUrl: 'https://cms.example.com/admin'
};

describe('renderIdleWorkspaceWarningMail', () => {
  it('names the workspace and the day in the subject', () => {
    expect(renderIdleWorkspaceWarningMail(base).subject).toBe(
      'Your workspace Titan Tours will be deleted on November 1, 2026'
    );
  });

  it('says what to do and links to the admin', () => {
    const mail = renderIdleWorkspaceWarningMail(base);

    expect(mail.text).toContain('has no pages yet');
    expect(mail.text).toContain('nothing you need to do');
    expect(mail.html).toContain(`href="${base.adminUrl}"`);
    expect(mail.text).toContain(base.adminUrl);
  });

  it('renders in Swedish', () => {
    const mail = renderIdleWorkspaceWarningMail({ ...base, locale: 'sv' });

    expect(mail.subject).toBe(
      'Din arbetsyta Titan Tours tas bort den 1 november 2026'
    );
    expect(mail.text).toContain('har inga sidor ännu');
    expect(mail.text).toContain('Öppna administrationen');
  });

  it('escapes the workspace name', () => {
    const mail = renderIdleWorkspaceWarningMail({
      ...base,
      workspaceName: '<script>alert(1)</script>'
    });

    expect(mail.html).not.toContain('<script>');
  });
});

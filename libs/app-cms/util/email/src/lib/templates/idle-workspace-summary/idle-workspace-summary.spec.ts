import { describe, expect, it } from 'vitest';

import { renderIdleWorkspaceSummaryMail } from './idle-workspace-summary';

const base = {
  locale: 'en' as const,
  warned: [{ name: 'Warned Co', deleteOn: new Date('2026-11-01T03:00:00Z') }],
  deleted: [{ name: 'Gone Co', usersDeleted: 2 }],
  provisioned: [{ name: 'Traces Co' }],
  unwarned: [
    { name: 'Lonely Co', reason: 'no-admin' as const },
    { name: 'Bounce Co', reason: 'mail-failed' as const }
  ],
  adminUrl: 'https://cms.example.com/admin'
};

describe('renderIdleWorkspaceSummaryMail', () => {
  it('has a fixed subject', () => {
    expect(renderIdleWorkspaceSummaryMail(base).subject).toBe(
      'Idle workspace cleanup'
    );
  });

  it('lists each outcome', () => {
    const { text } = renderIdleWorkspaceSummaryMail(base);

    expect(text).toContain('Warned Co');
    expect(text).toContain('Warned, deletes on November 1, 2026');
    expect(text).toContain('Gone Co');
    expect(text).toContain('Deleted, with 2 user(s) removed');
    expect(text).toContain('Traces Co');
    expect(text).toContain('deprovision by hand');
    expect(text).toContain('Lonely Co');
    expect(text).toContain('no verified admin');
    expect(text).toContain('Bounce Co');
    expect(text).toContain('warning mail failed');
  });

  it('renders in Swedish', () => {
    const { text } = renderIdleWorkspaceSummaryMail({ ...base, locale: 'sv' });

    expect(text).toContain('Varnad, tas bort den 1 november 2026');
  });
});

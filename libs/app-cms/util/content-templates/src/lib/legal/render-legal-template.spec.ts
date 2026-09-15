import { describe, expect, it } from 'vitest';

import {
  type LegalTemplateKind,
  type LegalTemplateVars,
  renderLegalTemplate
} from './render-legal-template';

const vars = (
  overrides: Partial<LegalTemplateVars> = {}
): LegalTemplateVars => ({
  tenantName: 'Moon Tours',
  contactEmail: 'hello@moon.test',
  tourSignups: true,
  tourRetentionDays: 180,
  formsRetentionDays: 90,
  humanCheck: true,
  sendgrid: true,
  errorMonitoring: true,
  errorMonitoringEu: true,
  ...overrides
});

const flags = [
  'tourSignups',
  'humanCheck',
  'sendgrid',
  'errorMonitoring',
  'errorMonitoringEu'
] as const;

describe('renderLegalTemplate', () => {
  it('fills in the workspace details', () => {
    const { markdown, title } = renderLegalTemplate('privacy', 'en', vars());

    expect(title).toBe('Privacy');
    expect(markdown).toContain('Moon Tours');
    expect(markdown).toContain('hello@moon.test');
    expect(markdown).toContain('180 days after the tour departs');
    expect(markdown).toContain('90 days');
  });

  it('leaves out what the workspace does not use', () => {
    const { markdown } = renderLegalTemplate(
      'privacy',
      'en',
      vars({
        tourSignups: false,
        humanCheck: false,
        errorMonitoring: false
      })
    );

    expect(markdown).not.toContain('## Tour signups');
    expect(markdown).not.toContain('Turnstile');
    expect(markdown).not.toContain('Sentry');
  });

  it('asks for a period when form submissions are kept until deleted', () => {
    const kept = renderLegalTemplate('privacy', 'en', vars());
    const unset = renderLegalTemplate(
      'privacy',
      'en',
      vars({ formsRetentionDays: null })
    );

    expect(kept.markdown).not.toContain('**Fill in:** how long');
    expect(unset.markdown).toContain('**Fill in:** how long');
  });

  it('names SendGrid only when it sends the email', () => {
    expect(renderLegalTemplate('privacy', 'sv', vars()).markdown).toContain(
      'Twilio SendGrid'
    );
    expect(
      renderLegalTemplate('privacy', 'sv', vars({ sendgrid: false })).markdown
    ).not.toContain('Twilio SendGrid');
  });

  it('keeps a section inside another one', () => {
    const withEu = renderLegalTemplate('privacy', 'en', vars()).markdown;
    const withoutEu = renderLegalTemplate(
      'privacy',
      'en',
      vars({ errorMonitoringEu: false })
    ).markdown;

    expect(withEu).toContain('stored in the EU');
    expect(withoutEu).toContain('Sentry');
    expect(withoutEu).not.toContain('stored in the EU');
  });

  // Every combination of the flags, so no template can leave a marker behind
  const combinations = Array.from({ length: 2 ** flags.length }, (_, bits) =>
    Object.fromEntries(flags.map((flag, i) => [flag, Boolean(bits & (1 << i))]))
  );

  it.each(
    (['privacy', 'terms'] as Array<LegalTemplateKind>).flatMap((kind) =>
      ['en', 'sv'].map((locale) => [kind, locale] as const)
    )
  )('leaves no markers or empty lines in %s (%s)', (kind, locale) => {
    for (const combination of combinations) {
      for (const formsRetentionDays of [30, null]) {
        const { markdown } = renderLegalTemplate(
          kind,
          locale,
          vars({ ...combination, formsRetentionDays })
        );

        expect(markdown).not.toMatch(/\{\{|\}\}/);
        expect(markdown).not.toMatch(/\n{3,}/);
      }
    }
  });
});

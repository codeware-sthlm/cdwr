import { describe, expect, it } from 'vitest';

import {
  type LegalTemplateKind,
  type LegalTemplateVars,
  renderLegalTemplate
} from './render-legal-template';

const vars = (
  overrides: Partial<LegalTemplateVars> = {}
): LegalTemplateVars => ({
  published: false,
  forms: true,
  tenantName: 'Moon Tours',
  contactEmail: 'hello@moon.test',
  tourSignups: true,
  tourRetentionDays: 180,
  formsRetentionDays: 90,
  humanCheck: true,
  sendgrid: true,
  errorMonitoring: true,
  errorMonitoringEu: true,
  analytics: true,
  ...overrides
});

const flags = [
  'published',
  'forms',
  'tourSignups',
  'humanCheck',
  'sendgrid',
  'errorMonitoring',
  'errorMonitoringEu',
  'analytics'
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

  it.each(['en', 'sv'] as const)(
    'describes visitor statistics only when they are on (%s)',
    (locale) => {
      const on = renderLegalTemplate('privacy', locale, vars()).markdown;
      const off = renderLegalTemplate(
        'privacy',
        locale,
        vars({ analytics: false })
      ).markdown;

      expect(on).toContain('Umami');
      expect(on).toMatch(/region|ort\)/);
      expect(off).not.toContain('Umami');
    }
  );

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

  it('marks a missing contact address instead of leaving a gap', () => {
    const en = renderLegalTemplate('privacy', 'en', vars({ contactEmail: '' }));
    const sv = renderLegalTemplate('terms', 'sv', vars({ contactEmail: '' }));

    expect(en.markdown).toContain('**[fill in a contact address]**');
    expect(en.markdown).not.toContain('{{contactEmail}}');
    expect(sv.markdown).toContain('**[fyll i en kontaktadress]**');
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

  it.each(
    (['privacy', 'terms'] as const).flatMap((kind) =>
      (['en', 'sv'] as const).map((locale) => [kind, locale] as const)
    )
  )('drops the draft banner when published (%s, %s)', (kind, locale) => {
    const draft = renderLegalTemplate(kind, locale, vars()).markdown;
    const published = renderLegalTemplate(
      kind,
      locale,
      vars({ published: true })
    ).markdown;

    expect(draft).toMatch(/Draft — review|Utkast — läs igenom/);
    expect(published).not.toMatch(/Draft — review|Utkast — läs igenom/);
    expect(published).toMatch(/^# /);
  });

  it.each([
    ['en', '## Forms', '**Fill in:** how long'],
    ['sv', '## Formulär', '**Fyll i:** hur länge']
  ] as const)(
    'drops the forms section when there are no forms (%s)',
    (locale, heading, prompt) => {
      const withForms = renderLegalTemplate(
        'privacy',
        locale,
        vars({ formsRetentionDays: null })
      ).markdown;
      const without = renderLegalTemplate(
        'privacy',
        locale,
        vars({ forms: false, formsRetentionDays: null })
      ).markdown;

      expect(withForms).toContain(heading);
      expect(withForms).toContain(prompt);
      expect(without).not.toContain(heading);
      expect(without).not.toContain(prompt);
    }
  );

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

import { privacyEn } from './privacy.en';
import { privacySv } from './privacy.sv';
import { termsEn } from './terms.en';
import { termsSv } from './terms.sv';

export type LegalTemplateKind = 'privacy' | 'terms';

export type LegalTemplateVars = {
  /** Workspace name, as the customer knows it */
  tenantName: string;
  /** Address a customer writes to about their data */
  contactEmail: string;
  /** The workspace has tours customers can sign up for */
  tourSignups: boolean;
  /** Days signup details are kept after departure */
  tourRetentionDays: number;
  /** Days form submissions are kept, or null when they are kept until deleted by hand */
  formsRetentionDays: number | null;
  /** Forms are checked with Cloudflare Turnstile */
  humanCheck: boolean;
  /** Email goes out through Twilio SendGrid */
  sendgrid: boolean;
  /** Errors are reported to Sentry */
  errorMonitoring: boolean;
  /** Sentry keeps the reports in its EU region */
  errorMonitoringEu: boolean;
};

const templates: Record<LegalTemplateKind, Record<'en' | 'sv', string>> = {
  privacy: { en: privacyEn, sv: privacySv },
  terms: { en: termsEn, sv: termsSv }
};

/** Page titles, so a created draft is recognisable in the pages list */
const titles: Record<LegalTemplateKind, Record<'en' | 'sv', string>> = {
  privacy: { en: 'Privacy', sv: 'Integritet' },
  terms: { en: 'Terms', sv: 'Villkor' }
};

/** `{{#key}}…{{/key}}` keeps its body when `key` is set, `{{^key}}…{{/key}}` when it is not */
const SECTION = /\{\{([#^])(\w+)\}\}([\s\S]*?)\{\{\/\2\}\}/;

/**
 * Fill a legal starter template with the workspace's own details.
 *
 * Generic text is text nobody reads: a page that names the workspace, its
 * contact address and its actual retention period is one an editor can correct
 * rather than one they have to write. Sections about something the workspace
 * does not use are left out. Unknown placeholders are left in place so a
 * missing value is visible in the draft instead of silently blank.
 */
export function renderLegalTemplate(
  kind: LegalTemplateKind,
  locale: string,
  vars: LegalTemplateVars
): { markdown: string; title: string } {
  const lang = locale === 'sv' ? 'sv' : 'en';

  // One section at a time, so a section inside a kept one is resolved as well
  let text = templates[kind][lang];
  for (let match = text.match(SECTION); match; match = text.match(SECTION)) {
    const [section, mode, key, body] = match;
    const isSet = Boolean(vars[key as keyof LegalTemplateVars]);
    text = text.replace(section, () => ((mode === '#') === isSet ? body : ''));
  }

  const markdown = Object.entries(vars)
    .filter(([, value]) => ['string', 'number'].includes(typeof value))
    .reduce(
      (filled, [key, value]) =>
        filled.replaceAll(`{{${key}}}`, () => String(value)),
      text
    )
    // A dropped section leaves its blank lines behind
    .replace(/\n{3,}/g, '\n\n');

  return { markdown, title: titles[kind][lang] };
}

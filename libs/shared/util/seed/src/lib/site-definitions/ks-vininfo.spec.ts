import { SiteDefinitionSchema } from '../site-definition.schema';

import { ksVininfo } from './ks-vininfo';
import {
  ksVininfoLegalVars,
  ksVininfoPrivacyMarkdown
} from './ks-vininfo-legal';

/**
 * Checked against the envelope rules, and held to the decisions that shaped
 * the page (COD-707), so a later edit that breaks one fails here rather than
 * reaching a visitor.
 */
describe('the kajstroberg.se definition', () => {
  const result = SiteDefinitionSchema.safeParse(ksVininfo);
  const text = JSON.stringify(ksVininfo);

  it('is a valid site definition', () => {
    if (!result.success) {
      throw new Error(
        result.error.issues
          .map(({ path, message }) => `${path.join('.')}: ${message}`)
          .join('\n')
      );
    }

    expect(result.success).toBe(true);
  });

  it('carries no tenant identity, which is the point of the format', () => {
    expect(text).not.toMatch(/apiKey|lookupApiKey/);
  });

  it('is a home page and a privacy page', () => {
    expect(ksVininfo.pages.map(({ slug }) => slug)).toEqual([
      'hem',
      'integritet'
    ]);
  });

  // The Alsace trip of October 2026 is over; Kaj adds the next one himself.
  // The copyright line is a template, so `{year}` is not a date here
  it('announces no dated trip', () => {
    const copy = JSON.stringify({ ...ksVininfo, siteSettings: undefined });

    expect(copy).not.toMatch(/20\d\d|oktober|Alsace|Tyskland/i);
  });

  it('states the travel guarantee verbatim', () => {
    expect(text).toContain('Vi har resegaranti hos Kammarkollegiet');
    expect(text).toContain(
      'Att vi har ordnat med resegaranti innebär att du kan få ersättning om någon del av din paketresa eller sammanlänkade researrangemang blir inställd om vi skulle drabbas av insolvens.'
    );
    expect(text).toContain(
      'Att vi har ordnat med resegaranti betyder att du har rätt till ersättning för den del av paketresan eller sammanlänkade researrangemanget som vi ansvarar för och som inte har fullgjorts.'
    );
  });

  // Development and previews must never mail Kaj; go-live changes it (COD-710)
  it('has an interest form with its own fields and a placeholder recipient', () => {
    const [form] = ksVininfo.forms ?? [];

    expect(ksVininfo.forms).toHaveLength(1);
    expect(form.title).toBe('Intresseanmälan');
    expect(form.fields?.map(({ name }) => name)).toEqual([
      'name',
      'email',
      'phone',
      'message'
    ]);
    expect(form.emailTo).toMatch(/@ks-vininfo\.dev$/);
  });

  it('offers the lingon theme alone', () => {
    expect(ksVininfo.siteSettings?.general?.themes).toEqual(['lingon']);
    expect(ksVininfo.siteSettings?.general?.defaultTheme).toBe('lingon');
  });

  it('wires the privacy page, which the footer links from the settings', () => {
    expect(ksVininfo.siteSettings?.legal).toEqual({
      privacyPage: { lookupSlug: 'integritet' }
    });
    expect(ksVininfoPrivacyMarkdown).not.toMatch(/\{\{/);
    expect(ksVininfoPrivacyMarkdown).toContain('kaj.stroberg@gmail.com');
  });

  it('leaves no blank to fill in on the privacy page', () => {
    expect(ksVininfoPrivacyMarkdown).not.toContain('Fyll i');
  });

  // The page states the period the setting enforces
  it('states the same retention in the setting and on the page', () => {
    expect(ksVininfo.siteSettings?.forms?.retentionDays).toBe(365);
    expect(ksVininfoLegalVars.formsRetentionDays).toBe(365);
  });
});

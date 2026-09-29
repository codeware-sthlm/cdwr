import { SiteDefinitionSchema } from '../site-definition.schema';

import { codewareSe } from './codeware-se';

/**
 * Checked against the envelope rules, and held to the decisions that shaped
 * the copy (COD-514), so a later edit that breaks one fails here rather than
 * reaching a visitor.
 */
describe('the codeware.se definition', () => {
  const result = SiteDefinitionSchema.safeParse(codewareSe);
  const text = JSON.stringify(codewareSe);

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

  // Decided 2026-09-28: a front for the company, not a pitch or a shorter CV
  it('is one page with no client, service pitch or form', () => {
    expect(codewareSe.pages.map(({ slug }) => slug)).toEqual(['hem']);
    expect(codewareSe.forms ?? []).toEqual([]);
    expect(text).not.toMatch(/Handelsbanken|RCO|Alfred Berg|Epsilon|HSB|CV\b/i);
  });

  // A business site should look like itself: one theme, so no switcher
  it('offers the Codeware theme alone', () => {
    expect(codewareSe.siteSettings?.general?.themes).toEqual(['codeware']);
    expect(codewareSe.siteSettings?.general?.defaultTheme).toBe('codeware');
  });

  // Decided 2026-09-28: the company as it is today, not two decades back
  it('describes the company today, not the automation work of old', () => {
    expect(text).not.toMatch(/automatiser|handarbete|maskinteknik/i);
  });

  // Decided 2026-09-30: the brand names the site, the legal name only the
  // copyright line, and the running copy says Codeware
  it('keeps the brand and the legal name apart', () => {
    expect(codewareSe.siteSettings?.general?.appName).toBe('Codeware Sthlm');
    expect(codewareSe.siteSettings?.footer?.copyright).toBe(
      '© {year} Codeware Sthlm AB'
    );
    expect(text.match(/Codeware Sthlm AB/g)?.length).toBe(1);
  });

  it('is reached at hello@codeware.se, from the footer', () => {
    expect(codewareSe.siteSettings?.footer?.contact).toContainEqual(
      expect.objectContaining({ platform: 'email', email: 'hello@codeware.se' })
    );
  });

  // Shown, not argued: platform talk stays in its one section
  it('names no framework, and links the platform', () => {
    expect(text).not.toMatch(/Payload|Next\.js|Nx\b/);
    expect(text).toContain('https://cdwr.io');
  });
});

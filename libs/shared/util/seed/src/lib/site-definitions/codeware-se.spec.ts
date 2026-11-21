import { SiteDefinitionSchema } from '../site-definition.schema';

import { codewareSe } from './codeware-se';
import { codewareSePrivacyMarkdown } from './codeware-se-legal';

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
    expect(codewareSe.pages.map(({ slug }) => slug)).toEqual([
      'hem',
      'privacy'
    ]);
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

  // The platform's defaults are placeholders: they must never reach a live site
  it('states its own footer, with none of the default placeholders', () => {
    const footer = codewareSe.siteSettings?.footer;

    expect(footer?.variant).toBe('expanded');
    expect(JSON.stringify(footer)).not.toMatch(/\.dev|46 70 123 45 67/);
    expect(footer?.contact?.some(({ platform }) => platform === 'phone')).toBe(
      false
    );
  });

  it('wires the legal pages, which the footer links from the settings', () => {
    const slugs = codewareSe.pages.map(({ slug }) => slug);

    expect(codewareSe.siteSettings?.legal).toEqual({
      privacyPage: { lookupSlug: 'privacy' }
    });
    expect(slugs).toContain('privacy');
    expect(slugs).not.toContain('terms');
    expect(codewareSe.navigation ?? []).toEqual([]);
  });

  it('leaves no placeholder or draft marker anywhere in the definition', () => {
    expect(JSON.stringify(codewareSe)).not.toMatch(
      /\[fill in|\[fyll i|\*\*Fill in:\*\*|\*\*Fyll i:\*\*|Draft — review before publishing|Utkast — läs igenom/
    );
    // Template markers are checked on the text only: component source has `{{`
    expect(codewareSePrivacyMarkdown).not.toMatch(/\{\{/);
    expect(codewareSePrivacyMarkdown).toContain('hello@codeware.se');
  });
});

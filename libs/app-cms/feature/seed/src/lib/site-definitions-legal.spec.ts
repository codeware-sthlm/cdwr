import { renderLegalTemplate } from '@codeware/app-cms/util/content-templates';
import {
  cdwrIo,
  cdwrIoLegalVars,
  cdwrIoPrivacyMarkdown,
  codewareSe,
  codewareSeLegalVars,
  codewareSePrivacyMarkdown,
  ksVininfo,
  ksVininfoLegalVars,
  ksVininfoPrivacyMarkdown
} from '@codeware/shared/util/seed/site-definitions';

/**
 * The definitions carry the legal text as literals, since the seed lib cannot
 * import the templates. This is what keeps those literals from going stale.
 */
describe.each([
  {
    site: 'cdwr.io',
    locale: 'en',
    definition: cdwrIo,
    vars: cdwrIoLegalVars,
    privacy: cdwrIoPrivacyMarkdown
  },
  {
    site: 'codeware.se',
    locale: 'sv',
    definition: codewareSe,
    vars: codewareSeLegalVars,
    privacy: codewareSePrivacyMarkdown
  },
  {
    site: 'kajstroberg.se',
    locale: 'sv',
    definition: ksVininfo,
    vars: ksVininfoLegalVars,
    privacy: ksVininfoPrivacyMarkdown
  }
])('the legal pages of $site', ({ locale, definition, vars, privacy }) => {
  it('match the templates rendered with the same details', () => {
    expect(renderLegalTemplate('privacy', locale, vars).markdown).toBe(privacy);
  });

  it('are the text of the pages the legal settings point at', () => {
    const markdownOf = (slug: string) =>
      JSON.stringify(definition.pages.find((page) => page.slug === slug));

    const slug = definition.siteSettings?.legal?.privacyPage?.lookupSlug;

    expect(slug).toBeDefined();
    expect(markdownOf(slug as string)).toContain(
      JSON.stringify(privacy).slice(1, -1)
    );
  });
});

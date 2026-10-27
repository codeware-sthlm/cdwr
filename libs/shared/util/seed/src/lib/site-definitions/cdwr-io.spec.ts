import { SiteDefinitionSchema } from '../site-definition.schema';

import { cdwrIo } from './cdwr-io';
import { cdwrIoPrivacyMarkdown } from './cdwr-io-legal';

/**
 * The definition is checked by the compiler against Payload's block types, and
 * by this against the envelope rules. Neither replaces applying it to a real
 * tenant — the apply runs it inside a rolled-back transaction, where Payload
 * judges every field — but a definition that fails here would never get that
 * far, and a pull request should say so rather than a deploy.
 */
describe('the cdwr.io definition', () => {
  const result = SiteDefinitionSchema.safeParse(cdwrIo);

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
    expect(JSON.stringify(cdwrIo)).not.toMatch(/apiKey|lookupApiKey/);
  });

  it('invites no contact yet: no form on any page, and none stated', () => {
    // Decided 2026-09-26: /start is about building on the platform yourself.
    // Contact comes back as a form block when it is wanted
    const forms = cdwrIo.pages.flatMap(({ layout }) =>
      layout.filter((block) => block.blockType === 'form')
    );

    expect(forms).toEqual([]);
    expect(cdwrIo.forms ?? []).toEqual([]);
  });

  it('states the routes the content plan lays out', () => {
    // The gallery's index and entry pages are route chrome built from the
    // block registry, so they are not authored here
    const slugs = cdwrIo.pages.map(({ slug }) => slug);

    expect(slugs).toEqual([
      'home',
      'blocks',
      'studio',
      'components',
      'architecture',
      'devlog',
      'start',
      'privacy'
    ]);
  });

  it('files every post under a category it states', () => {
    const slugs = (cdwrIo.categories ?? []).map(({ slug }) => slug);

    for (const post of cdwrIo.posts ?? []) {
      for (const { lookupSlug } of post.categories ?? []) {
        expect(slugs).toContain(lookupSlug);
      }
    }
  });

  it('still carries the placeholder the testimonial is waiting on', () => {
    // A bracket left in production is the failure this guards against; it
    // fails loudly here first, when the real quote arrives and this is updated
    expect(JSON.stringify(cdwrIo)).toMatch(/\[A CLIENT SENTENCE/);
  });

  it('navigates only to pages it states', () => {
    const slugs = cdwrIo.pages.map(({ slug }) => slug);

    const links = (cdwrIo.navigation ?? []).flatMap((item) =>
      'children' in item ? item.children : [item]
    );

    for (const { reference } of links) {
      expect(slugs).toContain(reference.lookupSlug);
    }
  });

  it('shows on the components page the source it declares', () => {
    // The page prints the component's code beside the running component, so a
    // copy that drifted would show one thing and run another
    const source = cdwrIo.customComponents?.find(
      ({ slug }) => slug === 'theme-swatch'
    )?.source;
    const page = cdwrIo.pages.find(({ slug }) => slug === 'components');
    const listings = (page?.layout ?? []).filter(
      (block) => block.blockType === 'code' && block.language === 'tsx'
    );

    expect(source).toBeDefined();
    expect(listings).not.toEqual([]);
    for (const block of listings) {
      expect(block).toMatchObject({ code: source });
    }
  });

  it('places only custom components it declares', () => {
    const declared = (cdwrIo.customComponents ?? []).map(({ slug }) => slug);
    const placed = cdwrIo.pages.flatMap(({ layout }) =>
      layout.flatMap((block) =>
        block.blockType === 'custom-component'
          ? [block.component.lookupSlug]
          : []
      )
    );

    expect(placed).not.toEqual([]);
    for (const slug of placed) {
      expect(declared).toContain(slug);
    }
  });

  // The platform's defaults are placeholders: they must never reach a live site
  it('states its own footer, with none of the default placeholders', () => {
    const footer = cdwrIo.siteSettings?.footer;

    expect(footer?.variant).toBe('expanded');
    expect(footer?.contact).toContainEqual(
      expect.objectContaining({ platform: 'email', email: 'hello@codeware.se' })
    );
    expect(JSON.stringify(footer)).not.toMatch(/\.dev|46 70 123 45 67/);
    expect(footer?.contact?.some(({ platform }) => platform === 'phone')).toBe(
      false
    );
    expect(footer?.links).toContainEqual({
      link: expect.objectContaining({
        type: 'custom',
        url: 'https://github.com/codeware-sthlm/cdwr/blob/main/LICENSING.md'
      })
    });
  });

  it('wires the legal pages, which the footer links from the settings', () => {
    const slugs = cdwrIo.pages.map(({ slug }) => slug);

    expect(cdwrIo.siteSettings?.legal).toEqual({
      privacyPage: { lookupSlug: 'privacy' }
    });
    expect(slugs).toContain('privacy');
    expect(slugs).not.toContain('terms');
    expect(JSON.stringify(cdwrIo.navigation)).not.toMatch(/privacy|terms/);
  });

  it('leaves no placeholder or draft marker anywhere in the definition', () => {
    expect(JSON.stringify(cdwrIo)).not.toMatch(
      /\[fill in|\[fyll i|\*\*Fill in:\*\*|\*\*Fyll i:\*\*|Draft — review before publishing|Utkast — läs igenom/
    );
    // Template markers are checked on the text only: component source has `{{`
    expect(cdwrIoPrivacyMarkdown).not.toMatch(/\{\{/);
    expect(cdwrIoPrivacyMarkdown).toContain('hello@codeware.se');
  });

  it('groups the platform pages in the menu, with Get started as the button', () => {
    expect(cdwrIo.navigation).toEqual([
      {
        label: 'Platform',
        children: ['blocks', 'studio', 'components', 'architecture'].map(
          (lookupSlug) =>
            expect.objectContaining({
              reference: { relationTo: 'pages', lookupSlug }
            })
        )
      },
      expect.objectContaining({
        reference: { relationTo: 'pages', lookupSlug: 'devlog' }
      }),
      expect.objectContaining({
        reference: { relationTo: 'pages', lookupSlug: 'start' },
        appearance: 'button'
      })
    ]);
  });
});

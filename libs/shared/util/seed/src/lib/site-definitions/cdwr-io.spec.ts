import { SiteDefinitionSchema } from '../site-definition.schema';

import { cdwrIo } from './cdwr-io';

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
      'architecture',
      'devlog',
      'start'
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

    for (const { reference } of cdwrIo.navigation ?? []) {
      expect(slugs).toContain(reference.lookupSlug);
    }
  });
});

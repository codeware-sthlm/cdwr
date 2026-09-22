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

  it('states the form its home page points at', () => {
    // The reference that would otherwise publish a page with a dead form block
    const titles = (cdwrIo.forms ?? []).map(({ title }) => title);

    expect(titles).toContain('Contact');
  });

  it('navigates only to pages it states', () => {
    const slugs = cdwrIo.pages.map(({ slug }) => slug);

    for (const { reference } of cdwrIo.navigation ?? []) {
      expect(slugs).toContain(reference.lookupSlug);
    }
  });
});

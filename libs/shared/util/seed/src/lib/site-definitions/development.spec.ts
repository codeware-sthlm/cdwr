import type { SiteDefinition } from '../site-definition';
import { SiteDefinitionSchema } from '../site-definition.schema';

import { moon } from './moon';
import { star } from './star';
import { sun } from './sun';

/**
 * What every development workspace shares.
 *
 * These definitions are not free to be *a* reasonable site — each has to be the
 * one already seeded, because the e2e suite asserts against what the seed
 * produces. The compiler checks the block shapes and this checks the envelope;
 * neither is the real proof. That is `cdwr tenant diff-site`, which reported
 * nothing missing and nothing extra for all three.
 */
describe.each([
  ['moon', moon],
  ['star', star],
  ['sun', sun]
])('the %s definition', (_name, definition: SiteDefinition) => {
  it('is a valid site definition', () => {
    const result = SiteDefinitionSchema.safeParse(definition);

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
    expect(JSON.stringify(definition)).not.toMatch(/apiKey|lookupApiKey/);
  });

  it('states the three listing pages the seed used to build imperatively', () => {
    const slugs = definition.pages.map(({ slug }) => slug);

    expect(slugs).toEqual(
      expect.arrayContaining(['posts', 'tours', 'file-area'])
    );
  });

  it('calls the posts listing page Posts in every locale', () => {
    // `customSeed` hardcoded this name while localising the block's title,
    // and a diff matches pages by slug — so getting it wrong is invisible
    const posts = definition.pages.find(({ slug }) => slug === 'posts');

    expect(posts?.name).toBe('Posts');
  });

  it('states the form its home page points at', () => {
    const titles = (definition.forms ?? []).map(({ title }) => title);

    expect(titles).toContain('Contact');
  });

  it('puts that form on the home page', () => {
    const home = definition.pages.find(({ slug }) => slug === 'home');
    const blocks = (home?.layout ?? []).map(({ blockType }) => blockType);

    expect(blocks).toContain('form');
  });

  it('navigates only to pages it states', () => {
    const slugs = definition.pages.map(({ slug }) => slug);

    for (const { reference } of definition.navigation ?? []) {
      expect(slugs).toContain(reference.lookupSlug);
    }
  });

  it('labels the three listings, as the seed did', () => {
    const labelled = (definition.navigation ?? []).filter(({ label }) => label);

    expect(labelled).toHaveLength(3);
  });

  it('keeps the colour and icon each tag pill is drawn with', () => {
    for (const tag of definition.tags ?? []) {
      expect(tag.brand?.color).toBeTruthy();
      expect(tag.brand?.icon).toBeTruthy();
    }
  });

  it('serves its media without authentication, as a file area needs', () => {
    // A browser fetching a file area download carries no api key, so media
    // that is not external is simply unreachable — and nothing says so
    for (const item of definition.media ?? []) {
      expect(item.external).toBe(true);
    }
  });

  it('gives every post an author and a date, which the listing orders by', () => {
    for (const post of definition.posts ?? []) {
      expect(post.authors?.length).toBeGreaterThan(0);
      expect(post.createdAt).toBeTruthy();
    }
  });
});

describe('the sun definition', () => {
  it('is Swedish, because its tenant is', () => {
    const fileArea = sun.pages.find(({ slug }) => slug === 'file-area');

    // A definition states one locale; the tenant that names it decides which
    expect(fileArea?.name).toBe('Filområde');
  });
});

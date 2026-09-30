import type { SiteDefinition } from '../site-definition';
import { SiteDefinitionSchema } from '../site-definition.schema';

import { moon } from './moon';
import { star } from './star';

/**
 * What every development workspace shares, regardless of size.
 *
 * Moon is a full workspace and Star is a deliberately minimal dummy tenant
 * (COD-502) — the invariants below hold for both. The richer "three listing
 * pages" shape below is Moon's alone; see `moon.spec.ts` and `star.spec.ts`
 * for what each one pins beyond this.
 */
describe.each([
  ['moon', moon],
  ['star', star]
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

/**
 * The richer shape only a full workspace carries. Moon is the only one today
 * — Star is intentionally minimal and does not have listing pages to name.
 */
describe.each([['moon', moon]])(
  'the %s definition, as a full workspace',
  (_name, definition: SiteDefinition) => {
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

    it('labels the three listings, as the seed did', () => {
      const labelled = (definition.navigation ?? []).filter(
        ({ label }) => label
      );

      expect(labelled).toHaveLength(3);
    });
  }
);

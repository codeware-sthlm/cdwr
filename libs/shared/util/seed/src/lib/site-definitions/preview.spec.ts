import type { SiteDefinition } from '../site-definition';
import { SiteDefinitionSchema } from '../site-definition.schema';

import { bamse } from './bamse';
import { marvel } from './marvel';
import { starWars } from './star-wars';

/**
 * The preview workspaces.
 *
 * Verified against the preview deployment of the pull request that added
 * them — `cdwr tenant diff-site --env=preview` reported nothing missing and
 * nothing extra for all three. These tests hold the envelope; that run is the
 * proof. Treat a future difference as the transcription being wrong, not the
 * fixture.
 */
describe.each([
  ['star-wars', starWars],
  ['marvel', marvel],
  ['bamse', bamse]
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

  it('states the three listing pages and the contact form', () => {
    const slugs = definition.pages.map(({ slug }) => slug);
    const titles = (definition.forms ?? []).map(({ title }) => title);

    expect(slugs).toEqual(
      expect.arrayContaining(['posts', 'tours', 'file-area'])
    );
    expect(titles).toContain('Contact');
  });

  it('calls the posts listing page Posts in every locale', () => {
    const posts = definition.pages.find(({ slug }) => slug === 'posts');

    expect(posts?.name).toBe('Posts');
  });

  it('gives every post an author and a date', () => {
    for (const post of definition.posts ?? []) {
      expect(post.authors?.length).toBeGreaterThan(0);
      expect(post.createdAt).toBeTruthy();
    }
  });
});

describe('the bamse definition', () => {
  it('is Swedish, because its tenant is', () => {
    const fileArea = bamse.pages.find(({ slug }) => slug === 'file-area');

    expect(fileArea?.name).toBe('Filområde');
  });
});

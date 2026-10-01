import { star } from './star';

/**
 * Star is never the deployment's own tenant — it is the *foreign* tenant the
 * cms e2e isolation tests use to prove moon-scoped access never leaks across
 * a workspace boundary (see `apps/cms-e2e/PERMISSIONS.md`). None of those
 * tests read its content by name, so it stays deliberately small rather than
 * mirroring Moon's full shape. The invariants it shares with the other
 * test workspaces live in `test-workspaces.spec.ts`.
 */
describe('the star definition', () => {
  it('stays a minimal dummy: home plus one other page, one post', () => {
    expect(star.pages).toHaveLength(2);
    expect(star.posts ?? []).toHaveLength(1);
  });

  it('carries no listing pages — nothing the e2e suite needs by name', () => {
    const slugs = star.pages.map(({ slug }) => slug);

    expect(slugs).toEqual(expect.arrayContaining(['home']));
    expect(slugs).not.toContain('posts');
    expect(slugs).not.toContain('tours');
    expect(slugs).not.toContain('file-area');
  });
});

import { moon } from './moon';

/**
 * Moon is the tenant the e2e suite asserts against by name, so its slugs are
 * part of the contract rather than a detail. The invariants it shares with the
 * other development workspaces live in `development.spec.ts`.
 */
describe('the moon definition', () => {
  it('keeps the slugs the e2e suite asserts against', () => {
    const slugs = moon.pages.map(({ slug }) => slug);

    // Changing any of these is changing what the suite tests, not a rename
    expect(slugs).toEqual(
      expect.arrayContaining([
        'home',
        'moon-members',
        'lunar-maria',
        'lunar-craters',
        'lunar-phases'
      ])
    );
  });

  it('keeps the members-only page members-only', () => {
    const members = moon.pages.find(({ slug }) => slug === 'moon-members');

    expect(members?.visibility).toBe('members');
  });
});

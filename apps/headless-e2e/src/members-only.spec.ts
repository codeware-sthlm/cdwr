import { expect, test } from './fixtures';

/**
 * Members-only content is never shown by headless.
 *
 * The site reads with the tenant api key, which belongs to no workspace and
 * sees public content only, and headless has no sign-in. `moon-members` is
 * seeded with `visibility: 'members'`, so to a visitor it does not exist.
 */
test.describe('members-only content', () => {
  test('is not readable by the public', async ({ page, request }) => {
    const response = await request.get('/moon-members', {
      headers: { accept: 'text/html' }
    });
    expect(response.status()).toBe(404);

    await page.goto('/moon-members');

    await expect(
      page.getByRole('heading', { name: 'Page not found' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'For members of the Moon workspace' })
    ).toHaveCount(0);
  });

  test('does not appear in navigation', async ({ page }) => {
    // Listing a page a visitor cannot open is a leak of its existence, and a
    // broken link besides
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

    // By where it leads rather than by its label, which the site may rename
    await expect(page.locator('a[href="/moon-members"]')).toHaveCount(0);
  });
});

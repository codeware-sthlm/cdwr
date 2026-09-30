import { expect, test } from '../fixtures';

test.describe('navigation', () => {
  test('contains links to the public pages', async ({ page }) => {
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Lunar Maria' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Articles' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Tours' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'About' })).toBeVisible();
  });

  test('navigation link routes to correct page', async ({ page }) => {
    await page.goto('/');

    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Lunar Maria' })
      .click();

    await page.waitForURL(/\/lunar-maria/, { timeout: 30_000 });
    await expect(
      page.getByRole('heading', { name: 'The Dark Plains of the Moon' })
    ).toBeVisible();
  });
});

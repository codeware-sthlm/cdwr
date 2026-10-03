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

  test('a group opens to its links and a child link routes', async ({
    page
  }) => {
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('button', { name: 'Explore' }).click();

    // Scoped: the footer lists the same link
    const child = nav.getByRole('link', { name: 'Block gallery' });
    await expect(child).toBeVisible();
    await child.click();

    await page.waitForURL(/\/blocks/, { timeout: 30_000 });
  });
});

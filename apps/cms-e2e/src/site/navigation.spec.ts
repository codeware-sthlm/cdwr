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
    const trigger = nav.getByRole('button', { name: 'Explore' });
    // Scoped: the footer lists the same link
    const child = nav.getByRole('link', { name: 'Block gallery' });

    // Hovered again until the panel shows: a pointer that arrives before the
    // header has hydrated opens nothing, and a click would toggle a group the
    // hover had just opened
    await expect(async () => {
      await trigger.hover();
      await expect(child).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await child.click();

    await page.waitForURL(/\/blocks/, { timeout: 30_000 });
  });
});

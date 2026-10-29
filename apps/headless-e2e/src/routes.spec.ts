import { expect, test } from './fixtures';

/**
 * The routes headless serves from the moon tenant's seeded content, rendered
 * by the built server. Everything is a page, a post or a tour in the cms, and
 * the path says which.
 */
test.describe('routes', () => {
  test('home renders the landing page', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'Look at the silver moon.' })
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });

  test('renders a page', async ({ page }) => {
    await page.goto('/lunar-maria');

    await expect(
      page.getByRole('heading', { name: 'The Dark Plains of the Moon' })
    ).toBeVisible();
  });

  test('lists posts', async ({ page }) => {
    await page.goto('/posts');

    await expect(
      page.getByRole('link', { name: 'Lunar Highlands' })
    ).toBeVisible();
  });

  test('renders a post', async ({ page }) => {
    await page.goto('/posts/lunar-highlands');

    // Scope to the article header to avoid the same title in the rich text
    await expect(
      page
        .locator('article header')
        .getByRole('heading', { name: 'Lunar Highlands' })
    ).toBeVisible();
  });

  test('renders a tour', async ({ page }) => {
    await page.goto('/tours/sea-of-tranquility-expedition');

    await expect(
      page.getByRole('heading', { name: 'Sea of Tranquility Expedition' })
    ).toBeVisible();
  });

  test('health answers without the cms', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});

test.describe('not found', () => {
  // A path no slug can match must be a miss, never a crash
  const paths = {
    'an unknown page': '/unknown-page-slug-xyz',
    'an unknown post': '/posts/unknown-post-slug-xyz',
    'an unknown tour': '/tours/unknown-tour-slug-xyz',
    'a malformed path': '/not%20a%20slug!'
  };

  for (const [name, path] of Object.entries(paths)) {
    test(`${name} answers 404`, async ({ page, request }) => {
      const response = await request.get(path, {
        headers: { accept: 'text/html' }
      });
      expect(response.status()).toBe(404);

      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: 'Page not found' })
      ).toBeVisible();
    });
  }
});

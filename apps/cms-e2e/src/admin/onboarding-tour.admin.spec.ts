/**
 * Admin UI — onboarding tour
 *
 * A workspace admin who hasn't seen the tour meets it on the dashboard. Every
 * way out marks it as seen, and the palette brings it back.
 *
 * Runs as `multiAdmin`, whom no other admin spec drives through the UI:
 * clearing the preference here would otherwise open the tour in a spec
 * running beside it as the same user.
 */

import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/login';

test.describe('/admin — onboarding tour', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // A first admin visit compiles the dashboard under `next dev`
  test.describe.configure({ timeout: 90_000 });

  test('opens on the first visit, stays closed once finished, opens from the palette', async ({
    page
  }) => {
    await loginAs(page, 'multiAdmin', { navigate: false, tour: true });

    // The user starts as a new one: nothing stored for the tour
    const cleared = await page.request.get(
      '/api/payload-preferences/admin-onboarding'
    );
    expect(cleared.status()).toBe(200);
    expect(((await cleared.json()) as { value?: unknown }).value ?? null).toBe(
      null
    );

    await page.goto('/admin');
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible();

    const tour = page.getByRole('dialog', {
      name: /Take a tour|Ta en rundtur/
    });
    await expect(tour).toBeVisible({ timeout: 30_000 });

    // Walk to the closing card; an admin sees all five steps
    for (let step = 0; step < 5; step++) {
      await tour.getByRole('button', { name: 'Next' }).click();
    }
    await expect(tour.getByText('More to discover')).toBeVisible();
    await tour.getByRole('button', { name: 'Done' }).click();
    await expect(tour).toBeHidden();

    // Finishing stored the preference the dashboard checks
    await expect(async () => {
      const res = await page.request.get(
        '/api/payload-preferences/admin-onboarding'
      );
      expect(res.status()).toBe(200);
      const { value } = (await res.json()) as {
        value?: { tourSeenAt?: string };
      };
      expect(value?.tourSeenAt).toBeTruthy();
    }).toPass({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible();
    await expect(tour).toBeHidden();

    // The shortcut is bound once the admin has hydrated, so retry it
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(async () => {
      await page.keyboard.press('ControlOrMeta+k');
      await expect(palette).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });

    await palette.getByRole('option', { name: 'Take the tour' }).click();
    await expect(tour).toBeVisible();
  });
});

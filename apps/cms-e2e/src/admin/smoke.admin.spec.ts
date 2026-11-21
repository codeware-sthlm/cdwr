/**
 * Admin UI — breadth-first smoke tests
 *
 * These assert almost nothing on purpose. The error guard in `fixtures.ts`
 * fails a test on an uncaught exception or a 5xx, so simply reaching a view is
 * the assertion — which is what makes visiting many of them worthwhile.
 *
 * This is the only place the admin React bundle runs at all. Two bugs that
 * reached a human first would have been caught here: a component missing from
 * the import map (silently absent) and a tab whose form state failed to
 * serialize (COD-431, a server-side crash on click).
 *
 * Views are derived from the collection lists rather than hardcoded, so a new
 * collection is smoke tested the day it is registered.
 */

import {
  globalCollectionSlugs,
  platformCollectionSlugs,
  tenantCollectionSlugs
} from '@codeware/app-cms/util/definitions';
import type { CollectionSlug } from '@codeware/shared/util/payload-types';
import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/login';

const isGlobal = (slug: string) =>
  (globalCollectionSlugs as ReadonlyArray<string>).includes(slug);

/**
 * Collections with autosave.
 *
 * Payload persists a draft the moment their create view mounts, because
 * autosave needs a document id to write to. A smoke test must not leave data
 * behind for the specs that run after it, so their create view is skipped —
 * the same fields are covered through the edit views below.
 */
const autosaveCollections = [
  'pages',
  'posts',
  'tours'
] as const satisfies readonly CollectionSlug[];

/** Tenant collections with a real list view — globals hold a single document */
const listViews = tenantCollectionSlugs.filter((slug) => !isGlobal(slug));

/**
 * Collections an editor creates through the admin.
 *
 * `form-submissions` are created by an api key on the public site, so its
 * create view is not part of the editor's workflow.
 */
const isAutosave = (slug: string) =>
  (autosaveCollections as ReadonlyArray<string>).includes(slug);

const createViews = listViews.filter(
  (slug) => slug !== 'form-submissions' && !isAutosave(slug)
);

/**
 * Platform-owned collections that open their one document instead of a list.
 *
 * `platform-settings` holds a single row, so its list view redirects to it.
 */
const singleDocumentViews = [
  'platform-settings'
] as const satisfies readonly CollectionSlug[];

const isSingleDocument = (slug: string) =>
  (singleDocumentViews as ReadonlyArray<string>).includes(slug);

/** Platform-owned collections with a list view, visible to system users only */
const platformViews = platformCollectionSlugs.filter(
  (slug) => !isSingleDocument(slug)
);

/** The collections an editor spends most of their time in */
const coreCollections = [
  'pages',
  'posts',
  'tours',
  'places'
] as const satisfies readonly CollectionSlug[];

/**
 * A list view shows a table of documents, or says there are none.
 *
 * `form-submissions` replaces Payload's list with its own (COD-432), so its
 * root carries a test id instead of rendering a table.
 */
const listRendered = (page: Page) =>
  page
    .getByRole('table')
    .or(page.getByText('No Results.'))
    .or(page.getByTestId('submissions-list'));

/**
 * Resolve the edit url of an existing document.
 *
 * Navigating by id keeps these independent of row order, which shifts as soon
 * as another spec touches the collection.
 */
const firstDocumentUrl = async (page: Page, slug: string) => {
  const res = await page.request.get(`/api/${slug}?limit=1&depth=0`);
  expect(res.status(), `GET /api/${slug}`).toBe(200);

  const { docs } = (await res.json()) as { docs: Array<{ id: number }> };
  expect(docs[0]?.id, `no seeded ${slug} document`).toBeTruthy();

  return `/admin/collections/${slug}/${docs[0].id}`;
};

test.describe('/admin — smoke', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Each test walks a dozen routes, and `next dev` compiles every one of them
  // the first time it is reached
  test.describe.configure({ timeout: 180_000 });

  test('unauthenticated access redirects to login', async ({ page }) => {
    await page.goto('/admin/collections/pages');

    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('every collection list view renders', async ({ page }) => {
    await loginAs(page, 'tenantAdmin', { navigate: true });

    for (const slug of listViews) {
      await page.goto(`/admin/collections/${slug}`);

      await expect(listRendered(page), `list view for ${slug}`).toBeVisible();
    }
  });

  test('every global renders its document', async ({ page }) => {
    await loginAs(page, 'tenantAdmin', { navigate: true });

    for (const slug of globalCollectionSlugs) {
      await page.goto(`/admin/collections/${slug}`);

      await expect(
        page.locator('.collection-list, .document-fields').first(),
        `global view for ${slug}`
      ).toBeVisible();
    }
  });

  test('every create view renders its form', async ({ page }) => {
    await loginAs(page, 'tenantAdmin', { navigate: true });

    for (const slug of createViews) {
      await page.goto(`/admin/collections/${slug}/create`);

      await expect(
        page.locator('.document-fields').first(),
        `create view for ${slug}`
      ).toBeVisible();
    }
  });

  test('platform-owned collections render for a system user', async ({
    page
  }) => {
    await loginAs(page, 'systemUser', { navigate: true });

    for (const slug of platformViews) {
      await page.goto(`/admin/collections/${slug}`);

      await expect(listRendered(page), `list view for ${slug}`).toBeVisible();
    }

    for (const slug of singleDocumentViews) {
      await page.goto(`/admin/collections/${slug}`);

      await expect(
        page.locator('.document-fields').first(),
        `document view for ${slug}`
      ).toBeVisible();
    }
  });

  test('the first document of each core collection opens', async ({ page }) => {
    await loginAs(page, 'tenantAdmin', { navigate: true });

    for (const slug of coreCollections) {
      await page.goto(await firstDocumentUrl(page, slug));

      await expect(
        page.locator('.document-fields').first(),
        `edit view for ${slug}`
      ).toBeVisible();
    }
  });

  test('every tour tab opens', async ({ page }) => {
    await loginAs(page, 'tenantAdmin', { navigate: true });
    await page.goto(await firstDocumentUrl(page, 'tours'));

    // Selecting a tab rebuilds form state on the server. A field that cannot be
    // serialized crashes that request rather than the browser, so the guard's
    // 5xx check is what catches it.
    //
    // The strip is server rendered before React attaches, so the first click
    // can land on a button with no handler and be dropped. Payload also
    // restores whichever tab was last open on this document, so which one
    // starts active varies — retry the click until the tab actually changes.
    for (const tab of ['Details', 'Itinerary', 'Content', 'SEO']) {
      await expect(async () => {
        await page.getByRole('button', { name: tab, exact: true }).click();

        await expect(
          page.locator('.tabs-field__tab-button--active'),
          `tour tab ${tab}`
        ).toContainText(tab, { timeout: 2_000 });
      }).toPass({ timeout: 30_000 });
    }
  });
});

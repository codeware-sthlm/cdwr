/**
 * Custom components — author, build, serve and place
 *
 * A developer saves a component, the build writes its outcome to `build`, and
 * an editor places it on a page that loads the bundle against the site's own
 * React. The steps share one component, so they run in order.
 *
 * Everything is created through the REST API. The build runs in-process here
 * (no builder service is configured), so it needs the workspace toolchain.
 */

import type {
  CustomComponent,
  Page as PageDoc
} from '@codeware/shared/util/payload-types';
import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/login';
import { withTenantAdmin } from '../helpers/with-tenant-admin';

const SLUG = 'e2e-counter';
const TAG = `cdwr-x-${SLUG}`;
const PAGE_SLUG = `e2e-custom-component-${Date.now()}`;

const SOURCE = `import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@site/ui';

type Props = { label?: string; step?: number };

export default function Counter({ label = 'Clicks', step = 1 }: Props) {
  const [count, setCount] = useState(0);
  return (
    <Card className="max-w-sm">
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent className="flex items-center gap-4">
        <span className="text-3xl font-semibold tabular-nums">{count}</span>
        <Button onClick={() => setCount((n) => n + step)}>+{step}</Button>
      </CardContent>
    </Card>
  );
}
`;

/** A cold toolchain on CI is slow; a local build takes about a second */
const BUILD_TIMEOUT = 90_000;

let componentId: number;
let pageId: number;
let builtHash: string;

const fetchComponent = async (page: Page): Promise<CustomComponent> => {
  const res = await page.request.get(
    `/api/custom-components/${componentId}?depth=0`
  );
  expect(res.status(), await res.text()).toBe(200);

  return (await res.json()) as CustomComponent;
};

/** Waits for the queued build to settle and returns the component */
const settledBuild = async (page: Page): Promise<CustomComponent> => {
  await expect
    .poll(async () => (await fetchComponent(page)).build.status, {
      timeout: BUILD_TIMEOUT,
      intervals: [500, 1_000, 2_000]
    })
    .toMatch(/^(ready|failed)$/);

  return fetchComponent(page);
};

/** Removes what an earlier, interrupted run may have left behind */
const removeComponents = async (page: Page) => {
  const res = await page.request.delete(
    `/api/custom-components?where[slug][equals]=${SLUG}`
  );
  expect(res.status(), await res.text()).toBe(200);
};

test.describe('custom components', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test.beforeAll(async ({ browser }) => {
    await withTenantAdmin(browser, removeComponents);
  });

  // Page first: it holds the relationship to the component
  test.afterAll(async ({ browser }) => {
    await withTenantAdmin(browser, async (page) => {
      if (pageId) {
        await page.request.delete(`/api/pages/${pageId}`);
      }
      await removeComponents(page);
    });
  });

  test('a saved component builds to a ready bundle', async ({ page }) => {
    await loginAs(page, 'tenantAdmin', { navigate: false });

    const res = await page.request.post('/api/custom-components', {
      data: {
        name: 'E2E Counter',
        slug: SLUG,
        source: SOURCE,
        propsSchema: [
          { name: 'label', type: 'text' },
          { name: 'step', type: 'number' }
        ]
      }
    });
    expect(res.status(), await res.text()).toBe(201);
    componentId = ((await res.json()) as { doc: CustomComponent }).doc.id;

    const { build } = await settledBuild(page);

    expect(build.status, JSON.stringify(build.diagnostics)).toBe('ready');
    expect(build.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(build.diagnostics).toEqual([]);

    builtHash = build.hash ?? '';
  });

  test('the bundle is public and cached for good', async ({ request }) => {
    // The fixture's api context carries the site gate cookie but no session
    const res = await request.get(
      `/api/custom-components/bundle/${builtHash}.js`
    );

    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/javascript');
    expect(res.headers()['cache-control']).toContain('immutable');
    expect(await res.text()).toContain(`customElements.define("${TAG}"`);
  });

  test('a placed component runs against the host React', async ({
    page,
    browser
  }) => {
    await withTenantAdmin(browser, async (admin) => {
      const res = await admin.request.post('/api/pages', {
        data: {
          name: 'E2E Custom Component Page',
          slug: PAGE_SLUG,
          layout: [
            {
              blockType: 'custom-component',
              component: componentId,
              props: { label: 'E2E', step: 3 }
            }
          ],
          _status: 'published'
        }
      });
      expect(res.status(), await res.text()).toBe(201);
      pageId = ((await res.json()) as { doc: PageDoc }).doc.id;
    });

    // The route compiles on first visit under `next dev`
    await page.goto(`/${PAGE_SLUG}`);

    const element = page.locator(TAG);
    await expect(element).toBeAttached({ timeout: 60_000 });

    // The key order of a stored JSON object is the database's to choose
    const attribute = await element.getAttribute('props');
    expect(JSON.parse(attribute ?? 'null')).toEqual({ label: 'E2E', step: 3 });

    // The button exists only once the bundle has defined the element and
    // mounted the component, so its handler is attached when it shows
    await expect(element.getByText('E2E')).toBeVisible({ timeout: 60_000 });
    const button = element.getByRole('button', { name: '+3' });
    await expect(button).toBeVisible();

    await button.click();
    await expect(element.getByText('3', { exact: true })).toBeVisible();

    await button.click();
    await expect(element.getByText('6', { exact: true })).toBeVisible();
  });

  test('a type error fails the build and keeps the previous bundle', async ({
    page
  }) => {
    await loginAs(page, 'tenantAdmin', { navigate: false });

    const res = await page.request.patch(
      `/api/custom-components/${componentId}`,
      { data: { source: `${SOURCE}\nconst x: number = 'nope';\n` } }
    );
    expect(res.status(), await res.text()).toBe(200);

    const { build } = await settledBuild(page);

    expect(build.status).toBe('failed');
    expect(build.hash).toBe(builtHash);

    const diagnostics = (build.diagnostics ?? []) as Array<{
      line: number;
      severity: string;
    }>;
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.line).toBeGreaterThan(1);
  });

  test('a user without the developer flag cannot create one', async ({
    page
  }) => {
    await loginAs(page, 'tenantUser', { navigate: false });

    const res = await page.request.post('/api/custom-components', {
      data: { name: 'E2E Intruder', slug: 'e2e-intruder', source: SOURCE }
    });

    expect(res.status()).toBe(403);
  });
});

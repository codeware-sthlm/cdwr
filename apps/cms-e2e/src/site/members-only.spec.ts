import { expect, test } from '../fixtures';
import { TEST_USERS, loginAs } from '../helpers/login';

/**
 * Gated content, proved against a real database.
 *
 * The access rules are the deliverable here, so these assert the failures
 * rather than the happy path. Two of them guard the shape that went wrong in
 * COD-422 and COD-425: content leaking through the identity the public site
 * runs as, and one workspace reading another's.
 *
 * `moon-members` is seeded with `visibility: 'members'` on the Moon tenant,
 * which the e2e runs as. `luna@local.dev` is a Moon **reader** — a member with
 * no edit rights anywhere.
 */

/**
 * Signs in through the real site form, as a visitor would.
 *
 * Browser navigation only. `page.request.*` does not always send the headers
 * Payload's CSRF check wants, so a cookie set this way is ignored there and the
 * call arrives **unauthenticated** — use `loginAs` for api assertions, which
 * sets the Authorization header as well.
 */
async function signIn(
  page: import('@playwright/test').Page,
  email: string,
  password = 'dev'
) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('members-only content', () => {
  test('is not readable by the public', async ({ page }) => {
    // The site renders as the tenant api key, which belongs to no workspace.
    // If the visibility filter is ever dropped this is what catches it, and it
    // is the failure that fails *open*.
    await page.goto('/moon-members');

    await expect(
      page.getByRole('heading', { name: 'Page not found' })
    ).toBeVisible();
  });

  test('is readable by a signed-in member', async ({ page }) => {
    await signIn(page, 'luna@local.dev');
    await page.goto('/moon-members');

    await expect(
      page.getByRole('heading', { name: 'For members of the Moon workspace' })
    ).toBeVisible();
  });

  test('is not readable by a member of another workspace', async ({ page }) => {
    // Antares administers Star and has no Moon membership. Signed in, but no
    // more entitled here than a stranger.
    await signIn(page, TEST_USERS.otherAdmin.email);
    await page.goto('/moon-members');

    await expect(
      page.getByRole('heading', { name: 'Page not found' })
    ).toBeVisible();
  });

  test('does not appear in navigation for the public', async ({ page }) => {
    // Listing a page a visitor cannot open is a leak of its existence, and a
    // broken link besides. Navigation drops an item whose reference did not
    // populate, which is what access control causes here.
    await page.goto('/');

    await expect(page.getByRole('link', { name: 'Moon Members' })).toHaveCount(
      0
    );
  });
});

test.describe('member sign-in', () => {
  test('is offered in the footer, and returns the visitor where they were', async ({
    page
  }) => {
    await page.goto('/lunar-maria');
    await page.getByRole('link', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/login\?from=%2Flunar-maria/);

    await page.getByLabel('Email').fill('luna@local.dev');
    await page.getByLabel('Password').fill('dev');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/lunar-maria$/);
    await expect(page.getByText('Luna Moon')).toBeVisible();
  });

  test('says nothing useful about a failed attempt', async ({ page }) => {
    // Wrong password and unknown address must read the same, or the form
    // becomes a way to discover who belongs to this workspace. Asserting both
    // against one literal is what pins them together.
    const refusal = 'Check your email and password, then try again.';

    await signIn(page, 'luna@local.dev', 'not-the-password');
    await expect(page.getByRole('alert')).toHaveText(refusal);

    await signIn(page, 'nobody@local.dev', 'dev');
    await expect(page.getByRole('alert')).toHaveText(refusal);
  });

  test('signing out lands on the home page, not the gated one', async ({
    page
  }) => {
    // Signing out can only take access away, so returning to where they were
    // would answer 404 whenever that page was gated
    await signIn(page, 'luna@local.dev');
    await page.goto('/moon-members');
    await page.getByRole('button', { name: 'Sign out' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });
});

test.describe('a reader is not an editor', () => {
  test('cannot open the admin panel', async ({ page }) => {
    await signIn(page, 'luna@local.dev');
    await page.goto('/admin');

    // Payload's `access.admin` refuses the panel. The reader must meet a
    // refusal, not a crash — the error guard fails this test on a 5xx, which
    // is the assertion that the denial stays clean.
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/admin\/collections/);
  });

  test('cannot read the member register through the api', async ({ page }) => {
    await loginAs(page, 'reader', { navigate: false });

    const response = await page.request.get('/api/users');

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('reads no tenant document, and is refused as a reader not an api key', async ({
    page
  }) => {
    // Tenant documents carry every tenant's api key. A reader is refused with
    // an empty result rather than a 403, because a flat refusal makes the
    // admin layout 500 before it can say "not allowed" — see
    // `restrictToTenantInTenantMode`. An api key still gets a 403 there, which
    // `api-key-scope.spec.ts` [K-03] pins.
    await loginAs(page, 'reader', { navigate: false });

    const response = await page.request.get('/api/tenants?limit=100');
    expect(response.status()).toBe(200);

    const { docs } = (await response.json()) as { docs: Array<unknown> };
    expect(docs).toEqual([]);
  });

  test('cannot write content through the api', async ({ page }) => {
    await loginAs(page, 'reader', { navigate: false });

    const response = await page.request.post('/api/pages', {
      data: { name: 'Reader wrote this', slug: 'reader-wrote-this' }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

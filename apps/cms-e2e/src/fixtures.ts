import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { type Coverage, test as base } from '@playwright/test';

import { SITE_GATE_COOKIE, siteGateCookie } from './helpers/site-gate';

export * from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Coverage JSON content saved by the `_coverage` fixture */
export type CoverageJsonContent = {
  result: Awaited<ReturnType<Coverage['stopJSCoverage']>>;
};

/** A page error or server failure seen while the test ran */
type ObservedError = string;

/** Patterns a test declares as expected, matched against the observed text */
export type AllowedErrors = Array<RegExp | string>;

const isAllowed = (error: ObservedError, allowed: AllowedErrors) =>
  allowed.some((pattern) =>
    typeof pattern === 'string' ? error.includes(pattern) : pattern.test(error)
  );

/**
 * Extended test with:
 *
 * - automatic V8 coverage collection (**Note!** Chromium only)
 * - an error guard that fails the test on an uncaught browser exception or a
 *   5xx response, so a page does not have to be asserted on to be smoke tested
 */
export const test = base.extend<{
  _coverage: void;
  _errorGuard: void;
  _siteGate: void;
  allowedErrors: AllowedErrors;
  siteGate: 'closed' | 'open';
}>({
  /**
   * Errors this test expects, so the guard stays quiet for them.
   *
   * Declared per file with `test.use({ allowedErrors: [...] })`. Prefer a
   * narrow pattern — a broad one silences the whole file.
   */
  allowedErrors: [[], { option: true }],

  /**
   * Whether this test arrives through the site gate.
   *
   * `open` is what every spec wants: the suite runs with a gate password set,
   * and a test is here to exercise the site rather than the gate. The gate's
   * own spec declares `closed` to meet it as an outsider does.
   */
  siteGate: ['open', { option: true }],

  /**
   * An api context that is through the gate as well.
   *
   * The public submit endpoints refuse a visitor who has not passed it, so a
   * spec posting to one is a visitor who got in — the same stance the browser
   * context takes. A spec declaring `siteGate: 'closed'` gets neither.
   */
  request: async ({ baseURL, playwright, siteGate }, use) => {
    const cookie = siteGate === 'open' ? siteGateCookie() : null;

    const context = await playwright.request.newContext({
      baseURL,
      ...(cookie
        ? {
            storageState: {
              cookies: [
                {
                  name: SITE_GATE_COOKIE,
                  value: cookie,
                  domain: 'localhost',
                  path: '/',
                  expires: -1,
                  httpOnly: true,
                  secure: false,
                  sameSite: 'Lax' as const
                }
              ],
              origins: []
            }
          }
        : {})
    });

    await use(context);
    await context.dispose();
  },

  /**
   * Carry the gate cookie into the browser context, on top of whatever
   * storage state the spec chose.
   */
  _siteGate: [
    async ({ baseURL, context, siteGate }, use) => {
      const cookie = siteGate === 'open' ? siteGateCookie() : null;

      if (cookie && baseURL) {
        await context.addCookies([
          { name: SITE_GATE_COOKIE, url: baseURL, value: cookie }
        ]);
      }

      await use();
    },
    { auto: true }
  ],

  /**
   * Fail on anything that broke without the test having to look for it.
   *
   * Covers uncaught exceptions in the browser and any 5xx the page received.
   * Console errors are deliberately *not* fatal: third-party noise, hydration
   * warnings and failed favicon loads would make the guard useless.
   *
   * Only browser-initiated traffic is observed. `page.request.*` calls go
   * through the context's API client, which does not raise page events — those
   * tests assert their status codes directly anyway.
   */
  _errorGuard: [
    async ({ page, allowedErrors }, use) => {
      const errors: Array<ObservedError> = [];

      page.on('pageerror', (error) => {
        errors.push(`uncaught: ${error.message}`);
      });

      page.on('response', (response) => {
        if (response.status() >= 500) {
          errors.push(`${response.status()}: ${response.url()}`);
        }
      });

      await use();

      const unexpected = errors.filter(
        (error) => !isAllowed(error, allowedErrors)
      );

      if (unexpected.length) {
        throw new Error(
          [
            `${unexpected.length} unexpected error(s) while the test ran:`,
            ...unexpected.map((error) => `  - ${error}`),
            '',
            'Add an `allowedErrors` pattern with `test.use({ allowedErrors: [...] })`',
            'when the error is the point of the test.'
          ].join('\n')
        );
      }
    },
    { auto: true }
  ],

  _coverage: [
    async ({ page }, use, testInfo) => {
      // page.coverage is only available in Chromium
      if (testInfo.project.name === 'chromium') {
        await page.coverage.startJSCoverage({ resetOnNavigation: false });
      }

      await use();

      if (testInfo.project.name === 'chromium') {
        const coverage = await page.coverage.stopJSCoverage();
        const dir = join(__dirname, '..', '.coverage', 'raw');

        mkdirSync(dir, { recursive: true });
        const name = testInfo.testId.replace(/[^\w]/g, '-');

        // monocart-coverage-reports expects the CDP raw coverage format
        const content: CoverageJsonContent = { result: coverage };
        writeFileSync(join(dir, `${name}.json`), JSON.stringify(content));
      }
    },
    { auto: true }
  ]
});

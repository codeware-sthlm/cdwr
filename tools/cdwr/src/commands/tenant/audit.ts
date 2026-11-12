import { mkdirSync, writeFileSync } from 'fs';
import { basename, join, relative } from 'path';

import type { Page, Response } from 'playwright';

import { defineCommand } from '../../cli/command';
import { input } from '../../cli/inputs';
import { definitionInput } from '../../services/site-definitions';

import {
  type AuditReport,
  type LinkResult,
  type NotFoundCheck,
  type PageAudit,
  auditFindings,
  auditMarkdown,
  isBroken,
  notFoundPath,
  ogCheck,
  sameOriginLinks
} from './audit.logic';
import {
  assertAnswers,
  assertPastGate,
  gatePasswordInput,
  routesFrom,
  stamp
} from './site-pages';
import { gateCookies, hostFolder } from './snapshot.logic';

/**
 * Opens a page, or null when it never answers (DNS, TLS, a timeout), so one
 * page that is down doesn't end the audit of the others
 */
const visit = (page: Page, href: string): Promise<Response | null> =>
  page
    .goto(href, { waitUntil: 'networkidle', timeout: 90_000 })
    .catch(() => null);

/** Pages, links and the 404 page of a site, looked at the way a visitor would */
export default defineCommand<
  {
    url: ReturnType<typeof input.string>;
    routes: ReturnType<typeof input.string>;
    definition: ReturnType<typeof input.optional<string>>;
    locales: ReturnType<typeof input.string>;
    gatePassword: ReturnType<typeof input.secret>;
  },
  { url: string; routes: Array<string>; locales: Array<string>; dir: string }
>({
  summary:
    "Audit a site's pages: status, console errors, axe, links, OG tags, 404",
  description:
    'Writes audit.json and audit.md under .site-snapshots/<host>/<stamp>/ and changes nothing on the site. With --gate-password it sees a gated site as an invited visitor.',
  danger: 'read',
  needs: [],
  inputs: {
    url: input.string({
      prompt: 'Which site?',
      short: 'u',
      description: 'Where the site is served',
      default: 'http://localhost:3000'
    }),
    // Before the definition, which is only needed when this is not given
    routes: input.string({
      prompt: 'Which routes?',
      short: 'r',
      description: "Comma-separated paths instead of a definition's pages",
      optional: true,
      flagOnly: true
    }),
    definition: input.optional(
      definitionInput('Audit the pages of which definition?'),
      (resolved) => !resolved['routes'],
      'does not apply with --routes'
    ),
    locales: input.string({
      prompt: 'In which locales?',
      short: 'L',
      description: 'Comma-separated locales the 404 page is checked in',
      default: 'sv,en'
    }),
    gatePassword: gatePasswordInput()
  },

  async plan(ctx, { url, routes, definition, locales }) {
    const paths = await routesFrom(ctx.root, routes, definition);

    await assertAnswers(url);

    const dir = join(ctx.root, '.site-snapshots', hostFolder(url), stamp());

    return {
      steps: [
        `Audit ${paths.length} route(s) from ${url}, and the 404 page in ${locales}`,
        `Into ${relative(ctx.root, dir)}`
      ],
      data: {
        url,
        routes: paths,
        locales: locales
          .split(',')
          .map((locale) => locale.trim())
          .filter(Boolean),
        dir
      }
    };
  },

  // The password stays out of the plan, which `--json` prints
  async apply(ctx, { url, routes, locales, dir }, { gatePassword }) {
    // Only this command needs a browser, so the others never load it
    const { chromium } = await import('playwright');
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    const browser = await chromium.launch();
    let gateCookie = false;
    const pages: Array<PageAudit> = [];
    const notFound: Array<NotFoundCheck> = [];
    let og = ogCheck({}, null);

    try {
      gateCookie = await assertPastGate(
        ctx,
        browser,
        url,
        routes[0] ?? '/',
        gatePassword
      );
      mkdirSync(dir, { recursive: true });

      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
      });
      await context.addCookies(gateCookies(url, gatePassword));
      const page = await context.newPage();
      let errors: Array<string> = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));

      // A link is asked once however many pages carry it; the context's
      // request shares its cookies, so the gate cookie goes along
      const answers = new Map<string, number | null>();
      const answerOf = async (href: string): Promise<number | null> => {
        if (!answers.has(href)) {
          answers.set(
            href,
            await context.request
              .get(href, { maxRedirects: 5, timeout: 30_000 })
              .then((response) => response.status())
              .catch(() => null)
          );
        }
        return answers.get(href) ?? null;
      };

      for (const route of routes) {
        await ctx.ui.task(
          route,
          async () => {
            errors = [];
            const abs = new URL(route, url).href;
            const response = await visit(page, abs);
            if (!response) {
              pages.push({
                route,
                status: null,
                consoleErrors: errors,
                axe: [],
                brokenLinks: []
              });
              return;
            }
            const status = response.status();
            const consoleErrors = errors;

            const { violations } = await new AxeBuilder({ page }).analyze();

            // No named functions in here: the CLI's runner wraps them in a
            // `__name` helper that does not exist in the page
            const hrefs = await page.evaluate(() =>
              [...document.querySelectorAll('a[href]')].map(
                (a) => a.getAttribute('href') ?? ''
              )
            );
            const brokenLinks: Array<LinkResult> = [];
            for (const href of sameOriginLinks(hrefs, abs)) {
              const linkStatus = await answerOf(href);
              if (isBroken(linkStatus)) {
                brokenLinks.push({ href, status: linkStatus });
              }
            }

            pages.push({
              route,
              status,
              consoleErrors,
              axe: violations.map((violation) => ({
                id: violation.id,
                impact: violation.impact ?? null,
                help: violation.help,
                nodes: violation.nodes.length
              })),
              brokenLinks
            });
          },
          () => {
            const audited = pages.find((audit) => audit.route === route);
            return `${audited?.status ?? 'no answer'}, ${audited?.axe.length ?? 0} axe`;
          }
        );
      }

      await ctx.ui.task('OG tags', async () => {
        // The home page, which the routes may not include or end on
        const home = new URL('/', url).href;
        if (page.url() !== home && !(await visit(page, home))) {
          // No home page, so every tag is missing
          return;
        }
        const tags = await page.evaluate(() => ({
          'og:title':
            document
              .querySelector('meta[property="og:title"]')
              ?.getAttribute('content') ?? null,
          'og:description':
            document
              .querySelector('meta[property="og:description"]')
              ?.getAttribute('content') ?? null,
          'og:image':
            document
              .querySelector('meta[property="og:image"]')
              ?.getAttribute('content') ?? null
        }));
        const image = tags['og:image']
          ? new URL(tags['og:image'], url).href
          : null;
        og = ogCheck(tags, image ? await answerOf(image) : null);
      });
      await context.close();

      for (const locale of locales) {
        await ctx.ui.task(`404 in ${locale}`, async () => {
          const localized = await browser.newContext({ locale });
          await localized.addCookies(gateCookies(url, gatePassword));
          const missing = await localized.newPage();
          const path = notFoundPath(basename(dir));
          const response = await visit(missing, new URL(path, url).href);
          notFound.push({
            locale,
            path,
            status: response?.status() ?? null,
            lang: response
              ? await missing.evaluate(() =>
                  document.documentElement.getAttribute('lang')
                )
              : null
          });
          await localized.close();
        });
      }
    } finally {
      await browser.close();
    }

    const report: AuditReport = {
      url,
      at: new Date().toISOString(),
      pages,
      gateCookie,
      og,
      notFound
    };
    writeFileSync(join(dir, 'audit.json'), JSON.stringify(report, null, 2));
    writeFileSync(join(dir, 'audit.md'), auditMarkdown(report));

    return {
      summary: `${pages.length} page(s) audited, ${auditFindings(report).length} finding(s); report in ${relative(ctx.root, dir)}`,
      json: report
    };
  }
});

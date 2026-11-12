/** One rule an axe run found broken on a page */
export type AxeFinding = {
  id: string;
  impact: string | null;
  help: string;
  /** How many elements break the rule */
  nodes: number;
};

/** A link and what it answered; null when it never answered */
export type LinkResult = { href: string; status: number | null };

export type PageAudit = {
  route: string;
  /** The page's HTTP status; null when it never answered */
  status: number | null;
  /** What the browser console reported as an error while the page loaded */
  consoleErrors: Array<string>;
  axe: Array<AxeFinding>;
  /** Only the links that did not answer well */
  brokenLinks: Array<LinkResult>;
};

/** The share-card tags of the home page */
export type OgCheck = {
  title: string | null;
  description: string | null;
  image: string | null;
  imageStatus: number | null;
  /** The tags that are absent, and an image that does not answer */
  missing: Array<string>;
};

/** What a path no site has answers, in one locale */
export type NotFoundCheck = {
  locale: string;
  path: string;
  status: number | null;
  /** The `lang` of the page shown */
  lang: string | null;
};

export type AuditReport = {
  url: string;
  at: string;
  /** Whether a gate cookie was sent with every request */
  gateCookie: boolean;
  pages: Array<PageAudit>;
  og: OgCheck;
  notFound: Array<NotFoundCheck>;
};

/**
 * The links of a page that stay on the same site, each once.
 *
 * Relative links are resolved against the page. Fragments are dropped, so a
 * link to a section is the page itself. Mail, phone and script links are not
 * pages and are left out, like anything that is not a URL.
 *
 * @param hrefs - The `href` attributes as written
 * @param base - The page they were found on
 */
export function sameOriginLinks(
  hrefs: ReadonlyArray<string>,
  base: string
): Array<string> {
  const origin = new URL(base).origin;
  const links = new Set<string>();

  for (const href of hrefs) {
    try {
      const url = new URL(href, base);
      if (url.origin !== origin || !/^https?:$/.test(url.protocol)) {
        continue;
      }
      url.hash = '';
      links.add(url.href);
    } catch {
      // Not a URL: nothing to follow
    }
  }

  return [...links];
}

/** A link that never answered, or answered with an error */
export const isBroken = (status: number | null): boolean =>
  status === null || status >= 400;

/**
 * The share-card check: which of title, description and image are missing, and
 * whether the image answers.
 *
 * @param tags - The `og:*` meta tags by property; null when absent
 * @param imageStatus - What the image URL answered, when there is one
 */
export function ogCheck(
  tags: Record<string, string | null>,
  imageStatus: number | null
): OgCheck {
  const title = tags['og:title'] || null;
  const description = tags['og:description'] || null;
  const image = tags['og:image'] || null;
  const missing = [
    ...(title ? [] : ['og:title']),
    ...(description ? [] : ['og:description']),
    ...(image ? [] : ['og:image']),
    ...(image && isBroken(imageStatus)
      ? [`og:image (answers ${imageStatus ?? 'nothing'})`]
      : [])
  ];

  return { title, description, image, imageStatus, missing };
}

/** A path no site has, so the 404 page answers */
export const notFoundPath = (stamp: string): string =>
  `/cdwr-audit-missing-${stamp}`;

/**
 * One short line per problem in a report, empty when all is well.
 *
 * Used for the summary and to paste into a ticket.
 */
export function auditFindings(report: AuditReport): Array<string> {
  const findings: Array<string> = [];

  for (const page of report.pages) {
    if (page.status === null || page.status >= 400) {
      findings.push(`${page.route}: answers ${page.status ?? 'nothing'}`);
    }
    if (page.consoleErrors.length) {
      findings.push(
        `${page.route}: ${page.consoleErrors.length} console error(s)`
      );
    }
    if (page.axe.length) {
      findings.push(
        `${page.route}: ${page.axe.length} axe violation(s) (${page.axe
          .map(({ id }) => id)
          .join(', ')})`
      );
    }
    if (page.brokenLinks.length) {
      findings.push(
        `${page.route}: ${page.brokenLinks.length} broken link(s) (${page.brokenLinks
          .map(({ href }) => href)
          .join(', ')})`
      );
    }
  }

  if (report.og.missing.length) {
    findings.push(`OG: missing ${report.og.missing.join(', ')}`);
  }

  for (const check of report.notFound) {
    if (check.status !== 404) {
      findings.push(
        `404 (${check.locale}): ${check.path} answers ${check.status ?? 'nothing'}`
      );
    }
  }

  return findings;
}

/** The report as a short markdown block to paste into a ticket */
export function auditMarkdown(report: AuditReport): string {
  const findings = auditFindings(report);

  return [
    `### Audit of ${report.url} at ${report.at}`,
    '',
    `Gate cookie: ${report.gateCookie ? 'sent' : 'not sent'}`,
    '',
    '| Route | Status | Console errors | Axe | Broken links |',
    '| --- | --- | --- | --- | --- |',
    ...report.pages.map(
      (page) =>
        `| ${page.route} | ${page.status ?? '-'} | ${page.consoleErrors.length} | ${page.axe.length} | ${page.brokenLinks.length} |`
    ),
    '',
    `OG: ${
      report.og.missing.length
        ? `missing ${report.og.missing.join(', ')}`
        : `title, description and image (${report.og.imageStatus})`
    }`,
    '',
    ...report.notFound.map(
      (check) =>
        `404 in ${check.locale}: ${check.status ?? 'no answer'}, lang ${check.lang ?? '-'}`
    ),
    '',
    ...(findings.length
      ? findings.map((finding) => `- ${finding}`)
      : ['No findings'])
  ].join('\n');
}

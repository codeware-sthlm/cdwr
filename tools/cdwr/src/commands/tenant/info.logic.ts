/**
 * Turning what the describe script reports into something a person reads.
 *
 * The shape is restated here rather than imported from the cms app: importing
 * it would pull Payload into the CLI, which is what running the work in a
 * subprocess avoids.
 */

export type TenantDomain = {
  hostname: string;
  app: string;
  isPrimary: boolean;
  certificate: string | null;
};

export type TenantSettings = {
  appName: string;
  defaultTheme: string;
  themes: Array<string>;
  colorScheme: string;
  chrome: string;
  defaultLocale: string;
};

export type TenantDetails = {
  id: number;
  name: string;
  slug: string;
  deployment: string | null;
  supportedLocales: Array<string>;
  createdAt: string;
  apiKey: string | null;
  domains: Array<TenantDomain>;
  /** `null` for a workspace that has been created and not yet filled */
  settings: TenantSettings | null;
  counts: Record<string, number>;
};

/** Reads the details the script printed, or says the run produced none. */
export function parseTenantDetails(stdout: string): Array<TenantDetails> {
  const line = stdout.match(/^TENANT_DETAILS=(.+)$/m)?.[1];

  if (!line) {
    throw new Error('The describe script reported no result');
  }

  const details = JSON.parse(line) as Array<TenantDetails>;

  if (!Array.isArray(details) || details.some((t) => !t?.slug)) {
    throw new Error('The describe script reported something unreadable');
  }

  return details;
}

/**
 * A workspace as the overview may show it: everything but the key.
 *
 * Omitted rather than nulled — a `null` key would read as "this workspace has
 * no key", which is a different fact from "not shown here".
 */
export function withoutKey(
  tenant: TenantDetails
): Omit<TenantDetails, 'apiKey'> {
  const copy: Partial<TenantDetails> = { ...tenant };
  delete copy.apiKey;
  return copy as Omit<TenantDetails, 'apiKey'>;
}

/** The counts as one line: `12 pages · 4 posts · 33 media` */
export const countsLine = (counts: Record<string, number>): string =>
  Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${n} ${label}`)
    .join(' · ') || 'empty';

/** The domain that names the site, or the first one, or nothing */
export const primaryHostname = (domains: Array<TenantDomain>): string =>
  (domains.find((d) => d.isPrimary) ?? domains[0])?.hostname ?? '—';

/** One workspace as a row of the overview table. No key here on purpose. */
export function summaryRow(tenant: TenantDetails): string[] {
  return [
    tenant.name,
    tenant.slug,
    tenant.deployment ?? '—',
    primaryHostname(tenant.domains),
    tenant.settings?.defaultTheme ?? '—',
    countsLine(tenant.counts)
  ];
}

/**
 * One workspace in full, as the lines of a note.
 *
 * The key is shown here and nowhere else: a detail view is asked for by name,
 * so the person wanted this workspace's particulars — and the key is the one
 * particular nothing else on the page can show.
 */
export function detailLines(tenant: TenantDetails): string[] {
  const { settings } = tenant;

  const domains = tenant.domains.length
    ? tenant.domains.map(
        (d) =>
          `  ${d.hostname}${d.isPrimary ? ' (primary)' : ''} → ${d.app}${
            d.certificate ? `, certificate ${d.certificate}` : ''
          }`
      )
    : ['  none — reachable on its .fly.dev address only'];

  return [
    `Slug         ${tenant.slug}`,
    `Deployment   ${tenant.deployment ?? 'none — stays local'}`,
    `Locales      ${tenant.supportedLocales.join(', ')}`,
    `Created      ${tenant.createdAt.slice(0, 10)}`,
    '',
    'Domains',
    ...domains,
    '',
    ...(settings
      ? [
          'Site',
          `  App name     ${settings.appName}`,
          `  Theme        ${settings.defaultTheme}${
            settings.themes.length > 1
              ? ` (offers ${settings.themes.join(', ')})`
              : ''
          }`,
          `  Scheme       ${settings.colorScheme}`,
          `  Chrome       ${settings.chrome}`,
          `  Locale       ${settings.defaultLocale}`
        ]
      : ['Site         not set up yet — `cdwr tenant apply-site` fills it']),
    '',
    `Content      ${countsLine(tenant.counts)}`,
    '',
    `API key      ${tenant.apiKey ?? 'none'}`
  ];
}

// Must be first: installs the guard before any module that might not finish
import './exit-guard';

import type { CollectionSlug, Payload } from 'payload';

import { report } from './report';
import { getScriptPayload, runScript } from './script-payload';

/**
 * Describe every workspace, or one, for `cdwr tenant info`.
 *
 * Read-only. Everything here can be seen in the admin one page at a time; this
 * puts it on one line per workspace, with the API key — which only Payload can
 * read back, since it decrypts it with the target environment's secret.
 *
 * Driven by env vars so the caller controls which database is targeted:
 * - `DESCRIBE_DATABASE_URL` - target database (required)
 * - `DESCRIBE_TENANT_SLUG` - one workspace instead of all of them
 *
 * The result is written to stdout as one `TENANT_DETAILS=` JSON line for the
 * caller. Nothing else prints the keys.
 */
async function describe() {
  const databaseUrl = process.env['DESCRIBE_DATABASE_URL'];
  const slug = process.env['DESCRIBE_TENANT_SLUG']?.trim() || undefined;

  if (!databaseUrl) {
    console.error('Error: DESCRIBE_DATABASE_URL is required');
    process.exit(1);
  }

  const payload = await getScriptPayload(databaseUrl);

  const { docs } = await payload.find({
    collection: 'tenants',
    ...(slug ? { where: { slug: { equals: slug } } } : {}),
    overrideAccess: true,
    pagination: false,
    depth: 0
  });

  if (slug && docs.length === 0) {
    console.error(`Error: no workspace with the slug '${slug}'`);
    process.exit(1);
  }

  const details = await Promise.all(
    docs.map(async (tenant) => {
      const [settings, counts] = await Promise.all([
        siteSettings(payload, tenant.id),
        countAll(payload, tenant.id)
      ]);

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        deployment: tenant.deployment ?? null,
        supportedLocales: tenant.supportedLocales,
        createdAt: tenant.createdAt,
        apiKey: tenant.apiKey ?? null,
        domains: (tenant.domains ?? []).map((domain) => ({
          hostname: domain.hostname,
          app: domain.app,
          isPrimary: Boolean(domain.isPrimary),
          certificate: domain.certificate?.status ?? null
        })),
        settings,
        counts
      };
    })
  );

  report('TENANT_DETAILS', JSON.stringify(details));
  process.exit(0);
}

/** What the site is set to, or `null` for a workspace not yet filled */
async function siteSettings(payload: Payload, tenantId: number) {
  const { docs } = await payload.find({
    collection: 'site-settings',
    where: { tenant: { equals: tenantId } },
    overrideAccess: true,
    depth: 0,
    limit: 1
  });

  const general = docs[0]?.general;

  if (!general) {
    return null;
  }

  return {
    appName: general.appName,
    defaultTheme: general.defaultTheme,
    themes: general.themes ?? [],
    colorScheme: general.colorScheme,
    chrome: general.chrome,
    defaultLocale: general.defaultLocale
  };
}

/** The collections worth a number, and how each one names its workspace */
const COUNTED: Array<
  [label: string, collection: CollectionSlug, field: string]
> = [
  ['pages', 'pages', 'tenant'],
  ['posts', 'posts', 'tenant'],
  ['media', 'media', 'tenant'],
  ['forms', 'forms', 'tenant'],
  ['submissions', 'form-submissions', 'tenant'],
  ['tours', 'tours', 'tenant'],
  ['users', 'users', 'tenants.tenant']
];

async function countAll(payload: Payload, tenantId: number) {
  const entries = await Promise.all(
    COUNTED.map(async ([label, collection, field]) => {
      const { totalDocs } = await payload.count({
        collection,
        where: { [field]: { equals: tenantId } },
        overrideAccess: true
      });
      return [label, totalDocs] as const;
    })
  );

  return Object.fromEntries(entries) as Record<string, number>;
}

runScript('describing', describe);

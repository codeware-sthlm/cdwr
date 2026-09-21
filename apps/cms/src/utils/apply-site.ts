import { pathToFileURL } from 'url';

import { applySiteDefinition } from '@codeware/app-cms/feature/seed';
import type { SiteDefinition } from '@codeware/shared/util/seed';

import { getScriptPayload, runScript } from './script-payload';

/**
 * Apply a site definition to a tenant, using the local-api.
 *
 * A definition states one site as data and carries no identity — no tenant, no
 * api key. The tenant is named here, and it has to exist already: this fills a
 * workspace, it does not create one.
 *
 * Runs as a script rather than from the admin panel for the same reason
 * rotation does. This writes across many collections at once on the operator's
 * authority, and the host stays read-only rather than holding that.
 *
 * Driven by env vars so the caller controls the target:
 * - `APPLY_DATABASE_URL` - target database (required; the caller reaches it
 *   through a pooler or a Fly proxy rather than the way a deployment does)
 * - `APPLY_TENANT_SLUG` - the workspace to fill (required)
 * - `APPLY_DEFINITION` - absolute path to the definition module (required)
 * - `APPLY_DRY_RUN` - anything but `false` rolls the transaction back
 *
 * The report is written to stdout as `APPLY_REPORT=` for the caller.
 */
async function applySite() {
  const databaseUrl = process.env['APPLY_DATABASE_URL'];
  const tenantSlug = process.env['APPLY_TENANT_SLUG'];
  const definitionPath = process.env['APPLY_DEFINITION'];

  // Only an explicit `false` commits. A missing or misspelled value rolls back,
  // which is the direction a mistake should fall
  const dryRun = process.env['APPLY_DRY_RUN'] !== 'false';

  for (const [name, value] of [
    ['APPLY_DATABASE_URL', databaseUrl],
    ['APPLY_TENANT_SLUG', tenantSlug],
    ['APPLY_DEFINITION', definitionPath]
  ] as const) {
    if (!value) {
      console.error(`Error: ${name} is required`);
      process.exit(1);
    }
  }

  const definition = await loadDefinition(definitionPath as string);
  const payload = await getScriptPayload(databaseUrl as string);

  const report = await applySiteDefinition(payload, definition, {
    tenantSlug: tenantSlug as string,
    dryRun
  });

  console.log(
    `[APPLY] ${report.outcomes.length} document(s), ${
      report.dryRun ? 'rolled back' : 'committed'
    }`
  );
  console.log(`APPLY_REPORT=${JSON.stringify(report)}`);

  process.exit(0);
}

/** Loads the definition module and finds the definition it exports. */
async function loadDefinition(path: string): Promise<SiteDefinition> {
  const imported = (await import(pathToFileURL(path).href)) as Record<
    string,
    unknown
  >;

  const definition =
    imported['default'] ?? imported['siteDefinition'] ?? imported['definition'];

  if (!definition || typeof definition !== 'object') {
    console.error(
      `Error: ${path} exports no site definition. Export it as the default, or as 'siteDefinition'.`
    );
    process.exit(1);
  }

  return definition as SiteDefinition;
}

runScript('apply-site', applySite);

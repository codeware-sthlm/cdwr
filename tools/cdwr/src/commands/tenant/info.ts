import { defineCommand, readOnly } from '../../cli/command';
import { input } from '../../cli/inputs';
import {
  redactReported,
  resolveDatabaseUrl,
  runCmsScript,
  withDatabase
} from '../../services/database';
import {
  ENVIRONMENTS,
  environmentInput,
  previewAppInput
} from '../../services/environment';
import type { Environment } from '../../services/infisical';

import {
  type TenantDetails,
  detailLines,
  parseTenantDetails,
  summaryRow,
  withoutKey
} from './info.logic';

/** Reads the workspaces in the cms app, where Payload can decrypt the keys */
async function describeInPayload(
  root: string,
  environment: Environment,
  databaseUrl: string,
  slug: string | undefined
): Promise<Array<TenantDetails>> {
  const { stdout, stderr } = await runCmsScript(
    root,
    'describe-tenants.ts',
    environment,
    {
      DESCRIBE_DATABASE_URL: databaseUrl,
      DESCRIBE_TENANT_SLUG: slug ?? ''
    }
  );

  try {
    return parseTenantDetails(stdout);
  } catch (error) {
    // Keys ride in the marker line, and this output ends up in a console
    throw new Error(
      [
        error instanceof Error ? error.message : String(error),
        '',
        '--- stdout ---',
        redactReported(stdout, 'TENANT_DETAILS').trim() || '<empty>',
        '',
        '--- stderr ---',
        stderr.trim() || '<empty>'
      ].join('\n')
    );
  }
}

/**
 * What a workspace is, on one screen.
 *
 * The admin shows all of this one page at a time and never the API key, which
 * only Payload can read back. One workspace by slug gets the full picture,
 * key included; no slug gets every workspace as a table, key left out — a
 * table scrolls past on production and lands in shell history.
 */
export default defineCommand<
  {
    environment: ReturnType<typeof environmentInput<typeof ENVIRONMENTS>>;
    previewApp: ReturnType<typeof previewAppInput>;
    tenant: ReturnType<typeof input.string>;
  },
  { tenants: Array<TenantDetails> }
>({
  summary: 'What a workspace is: details, site settings, content counts',
  description:
    'One slug shows the full picture, API key included. No slug lists every workspace without keys.',
  danger: 'read',
  needs: ['fly', 'infisical'],
  inputs: {
    environment: environmentInput(ENVIRONMENTS),
    previewApp: previewAppInput(),
    tenant: input.string({
      prompt: 'Which workspace? Leave empty for all of them',
      description: 'A slug for one workspace in full; empty for the overview',
      placeholder: 'all',
      optional: true
    })
  },

  async plan(ctx, { environment, previewApp, tenant }) {
    // Optional, so undefined when nobody could be asked
    const slug = tenant?.trim() || undefined;
    const databaseUrl = await resolveDatabaseUrl(environment, previewApp);

    const tenants = await ctx.ui.task(
      slug ? `Reading '${slug}'` : `Reading every workspace in ${environment}`,
      () =>
        withDatabase(databaseUrl, (url) =>
          describeInPayload(ctx.root, environment, url, slug)
        ),
      (list) => `${list.length} workspace(s)`
    );

    return readOnly({ tenants });
  },

  async apply(ctx, { tenants }) {
    if (tenants.length === 0) {
      return { summary: 'No workspaces yet', json: [] };
    }

    if (tenants.length === 1) {
      const [only] = tenants;
      ctx.ui.note(detailLines(only), only.name);
      return { summary: `'${only.slug}' read`, json: only };
    }

    ctx.ui.table(
      ['Name', 'Slug', 'Deployment', 'Domain', 'Theme', 'Content'],
      tenants.map(summaryRow)
    );
    ctx.ui.note(
      'Pass --tenant=<slug> for one workspace in full, API key included.'
    );

    return {
      summary: `${tenants.length} workspace(s)`,
      // Keys are left out of the overview everywhere, including here
      json: tenants.map(withoutKey)
    };
  }
});

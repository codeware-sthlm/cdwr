import { isAbsolute, resolve as resolvePath } from 'path';

import { defineCommand, readOnly } from '../../cli/command';
import { input } from '../../cli/inputs';
import { resolveDatabaseUrl, withDatabase } from '../../services/database';
import {
  ENVIRONMENTS,
  environmentInput,
  previewAppInput
} from '../../services/environment';
import { symbols, theme } from '../../ui/theme';

import { applyInPayload } from './apply-site';
import type { ApplyReport } from './apply-site.logic';

/**
 * How a tenant's site stands against a definition.
 *
 * `apply-site` only fills gaps, which is the right default and leaves a blind
 * spot: content drifts away from its definition without anyone being told.
 * This is the read-only half — it writes nothing and offers nothing, it just
 * says what the two have to say about each other.
 *
 * Field-level drift is not detected yet. A page that exists reads as present
 * however far its contents have wandered, so this answers "is it there", not
 * "is it the same".
 */
export default defineCommand<
  {
    environment: ReturnType<typeof environmentInput<typeof ENVIRONMENTS>>;
    previewApp: ReturnType<typeof previewAppInput>;
    tenant: ReturnType<typeof input.string>;
    definition: ReturnType<typeof input.string>;
  },
  { report: ApplyReport }
>({
  summary: "How a tenant's site differs from a definition",
  description:
    'Writes nothing. The comparison is made by applying the definition inside a transaction and rolling it back, so it is exact rather than a guess.',
  danger: 'read',
  needs: ['fly', 'infisical'],
  inputs: {
    environment: environmentInput(ENVIRONMENTS),
    previewApp: previewAppInput(),
    tenant: input.string({
      prompt: 'Which tenant?',
      description: 'The workspace to compare. It must already exist'
    }),
    definition: input.string({
      prompt: 'Which definition?',
      description: 'A module exporting a SiteDefinition as its default'
    })
  },

  async plan(ctx, { environment, previewApp, tenant, definition }) {
    const definitionPath = isAbsolute(definition)
      ? definition
      : resolvePath(ctx.root, definition);

    const databaseUrl = await resolveDatabaseUrl(environment, previewApp);

    const report = await ctx.ui.task(
      `Comparing '${tenant}' against the definition`,
      () =>
        withDatabase(databaseUrl, (url) =>
          // Always a dry run: this command has no other mode
          applyInPayload(
            ctx.root,
            environment,
            url,
            tenant,
            definitionPath,
            true
          )
        ),
      (r) => `${r.outcomes.length + r.extra.length} document(s) compared`
    );

    return readOnly({ report });
  },

  async apply(ctx, { report }) {
    const missing = report.outcomes.filter(
      ({ action }) => action === 'created'
    );
    const present = report.outcomes.filter(
      ({ action }) => action === 'existed'
    );
    const { extra } = report;

    const rows = [
      ...missing.map(({ collection, identifier }) => [
        theme.warn('missing'),
        collection,
        identifier,
        'named by the definition, not in the tenant'
      ]),
      ...extra.map(({ collection, identifier }) => [
        theme.muted('extra'),
        collection,
        identifier,
        'in the tenant, not named by the definition'
      ])
    ];

    if (rows.length === 0) {
      return {
        summary: `'${report.tenant.slug}' and the definition name the same ${present.length} document(s)`,
        json: report
      };
    }

    ctx.ui.table(['drift', 'collection', 'document', 'meaning'], rows);

    if (report.unresolved.length) {
      ctx.ui.note(
        [
          `${report.unresolved.length} reference(s) in the definition lead nowhere:`,
          ...report.unresolved.map(
            ({ blockType, field, lookup }) =>
              `  ${blockType}.${field} → '${lookup}'`
          ),
          'An apply would refuse to write while that is true.'
        ].join('\n')
      );
    }

    ctx.ui.note(
      `${symbols.info} Nothing here is deleted by an apply — it only creates what is missing.`
    );

    return {
      summary: `${missing.length} missing, ${extra.length} extra, ${present.length} in both`,
      json: report
    };
  }
});

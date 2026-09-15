import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  type LegalTemplateKind,
  convertMarkdownToLexical,
  renderLegalTemplate
} from '@codeware/app-cms/util/content-templates';
import { isUser } from '@codeware/app-cms/util/misc';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import {
  type Endpoint,
  type PayloadRequest,
  addDataAndFileToRequest,
  headersWithCors
} from 'payload';

import { getTenantWhereFromHeaders } from '../components/admin/utils/tenant-where';

/** Quoted in the starter text when the workspace has not set its own */
const FALLBACK_RETENTION_DAYS = 365;

const isKind = (value: unknown): value is LegalTemplateKind =>
  value === 'privacy' || value === 'terms';

/**
 * Create a privacy or terms page from the platform's starter template.
 *
 * A guide asked to write a privacy policy from an empty editor will either
 * skip it or paste something from a search result, and this is exactly the
 * text that matters when something goes wrong. So the platform supplies a
 * draft that describes what it actually does with a visitor's details — filled
 * in with the workspace's own name, contact address and retention periods, and
 * without sections about services this deployment does not use.
 *
 * Created **unpublished**, and the draft opens by saying it must be reviewed.
 * The relationship in Site Settings is filled in by the client rather than
 * here, so the editor still presses Save on a change they can see.
 */
export const createLegalPageEndpoint: Endpoint = {
  path: '/create-legal-page',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const { payload, user } = req;

    if (!isUser(user)) {
      return Response.json(
        { error: getReasonPhrase(StatusCodes.FORBIDDEN) },
        { status: StatusCodes.FORBIDDEN }
      );
    }

    await addDataAndFileToRequest(req);
    const body = (req.data ?? {}) as { kind?: unknown };

    if (!isKind(body.kind)) {
      return Response.json(
        { error: getReasonPhrase(StatusCodes.BAD_REQUEST) },
        { status: StatusCodes.BAD_REQUEST }
      );
    }

    try {
      // The workspace the editor is currently in — the same scope their own
      // reads run under, so a page can only be created where they can see it
      const tenantWhere = getTenantWhereFromHeaders(req.headers, user);
      // Only a single selected workspace resolves to an id worth stamping;
      // otherwise the multi-tenant plugin assigns it from the user's own
      const selected = (tenantWhere as { tenant?: { equals?: unknown } })
        ?.tenant?.equals;
      const tenantId = Number(selected);

      const { docs } = await payload.find({
        collection: 'site-settings',
        where: tenantWhere ?? {},
        depth: 0,
        limit: 1,
        overrideAccess: false,
        user,
        req
      });

      const settings = docs[0];

      // A workspace with no tours takes no signups, so the notice leaves them out
      const tours = await payload.count({
        collection: 'tours',
        where: tenantWhere ?? {},
        overrideAccess: false,
        user,
        req
      });
      const { EMAIL, HUMAN_CHECK, SENTRY } = getEnv();
      // `all` is a read-time locale and cannot be written to; the draft is
      // created in English then, and the editor translates from there
      const locale = req.locale === 'sv' ? 'sv' : 'en';

      const { markdown, title } = renderLegalTemplate(body.kind, locale, {
        tenantName: settings?.general?.appName ?? '',
        contactEmail: user.email,
        tourSignups: tours.totalDocs > 0,
        tourRetentionDays:
          settings?.tourSignups?.retentionDays ?? FALLBACK_RETENTION_DAYS,
        formsRetentionDays: settings?.forms?.retentionDays ?? null,
        humanCheck: Boolean(HUMAN_CHECK),
        sendgrid: Boolean(EMAIL && 'sendgrid' in EMAIL),
        errorMonitoring: Boolean(SENTRY),
        errorMonitoringEu: Boolean(SENTRY?.dsn.includes('.de.sentry.io'))
      });

      const page = await payload.create({
        collection: 'pages',
        data: {
          name: title,
          slug: body.kind === 'privacy' ? 'privacy' : 'terms',
          layout: [
            {
              blockType: 'content',
              columns: [
                {
                  size: 'full',
                  richText: await convertMarkdownToLexical(
                    payload.config,
                    markdown
                  )
                }
              ]
            }
          ],
          // Nothing unreviewed can reach a visitor
          _status: 'draft',
          ...(Number.isInteger(tenantId) && tenantId > 0
            ? { tenant: tenantId }
            : {})
        },
        depth: 0,
        draft: true,
        locale,
        overrideAccess: false,
        user,
        req
      });

      return Response.json(
        { id: page.id, slug: page.slug, title },
        {
          status: StatusCodes.OK,
          headers: headersWithCors({ headers: new Headers(), req })
        }
      );
    } catch (error) {
      payload.logger.error(`[createLegalPage] Create failed: ${String(error)}`);
      return Response.json(
        { error: getReasonPhrase(StatusCodes.INTERNAL_SERVER_ERROR) },
        { status: StatusCodes.INTERNAL_SERVER_ERROR }
      );
    }
  }
};

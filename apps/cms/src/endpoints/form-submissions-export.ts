import {
  getFormSubmissions,
  getForms,
  mapToRuntime
} from '@codeware/app-cms/data-access';
import { canEdit } from '@codeware/app-cms/util/misc';
import { resolveSubmissionFields } from '@codeware/shared/util/payload-utils';
import { CSV_BOM, csvRow, toFileSlug } from '@codeware/shared/util/pure';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import type { Endpoint, PayloadRequest } from 'payload';

import { getTenantWhereFromHeaders } from '../components/admin/utils/tenant-where';

/**
 * Cap on exported rows. A form with more replies than this is refused rather
 * than truncated — a CSV that is quietly missing rows is worse than no CSV,
 * because nothing about the file says it is incomplete. Beyond this a
 * background job is the right answer.
 */
const MAX_ROWS = 5000;

/**
 * Export one form's submissions as CSV.
 *
 * Scoped to a single form because the columns are the form's own fields —
 * a cross-form export would be a sparse union no spreadsheet reader wants.
 * Columns follow the form's field order and use its labels, with any value
 * whose field has since been removed appended in trailing columns.
 *
 * Reads run under the caller's own access control and workspace scope, so an
 * editor can only export the forms they can already open.
 */
export const formSubmissionsExportEndpoint: Endpoint = {
  path: '/form-submissions-export',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!canEdit(req.user)) {
      return Response.json(
        { error: getReasonPhrase(StatusCodes.FORBIDDEN) },
        { status: StatusCodes.FORBIDDEN }
      );
    }

    const formId = Number(req.query?.['form']);
    if (!Number.isInteger(formId) || formId <= 0) {
      return Response.json(
        { error: 'A `form` query parameter is required' },
        { status: StatusCodes.BAD_REQUEST }
      );
    }

    try {
      const tenantWhere = getTenantWhereFromHeaders(req.headers, req.user);
      const runtime = mapToRuntime(req.payload, req.user);

      // Scoped like the submissions query below: the form supplies the
      // filename and every column label, so letting it escape the selected
      // workspace would break the scope this endpoint promises
      const forms = await getForms(runtime, {
        where: {
          and: [
            { id: { equals: formId } },
            ...(tenantWhere ? [tenantWhere] : [])
          ]
        },
        limit: 1
      });
      const form = forms?.docs?.[0] ?? null;

      if (!form) {
        return Response.json(
          { error: getReasonPhrase(StatusCodes.NOT_FOUND) },
          { status: StatusCodes.NOT_FOUND }
        );
      }

      const submissions = await getFormSubmissions(runtime, {
        where: {
          and: [
            { form: { equals: formId } },
            ...(tenantWhere ? [tenantWhere] : [])
          ]
        },
        limit: MAX_ROWS
      });

      if (!submissions) {
        // The query failed; emitting an empty CSV would read as "no messages"
        throw new Error('submissions query failed');
      }

      if (submissions.totalDocs > MAX_ROWS) {
        return Response.json(
          {
            error: `This form has ${submissions.totalDocs} submissions, more than the ${MAX_ROWS} this export can return.`
          },
          { status: StatusCodes.REQUEST_TOO_LONG }
        );
      }

      const rows = submissions.docs.map((doc) => ({
        createdAt: doc.createdAt,
        fields: resolveSubmissionFields(form, doc.submissionData)
      }));

      // Column order follows the form; orphaned fields are appended in the
      // order they are first met so every value still lands in the file
      const columns: Array<{ name: string; label: string }> = [];
      const seen = new Set<string>();
      for (const row of rows) {
        for (const field of row.fields) {
          if (!seen.has(field.name)) {
            seen.add(field.name);
            columns.push({ name: field.name, label: field.label });
          }
        }
      }
      columns.sort((a, b) => {
        const orderOf = (name: string) =>
          (form.fields ?? []).findIndex(
            (field) => 'name' in field && field.name === name
          );
        const [orderA, orderB] = [orderOf(a.name), orderOf(b.name)];
        // Orphaned fields (-1) sort last, keeping their first-seen order
        if (orderA === orderB) return 0;
        if (orderA === -1) return 1;
        if (orderB === -1) return -1;
        return orderA - orderB;
      });

      const csv = [
        csvRow(['Received', ...columns.map((column) => column.label)]),
        ...rows.map((row) => {
          const values = new Map(
            row.fields.map((field) => [field.name, field.value])
          );
          return csvRow([
            row.createdAt,
            ...columns.map((column) => values.get(column.name) ?? '')
          ]);
        })
      ].join('\r\n');

      // The id keeps the name unique: `toFileSlug` drops non-ASCII, so two
      // differently named forms can slug to the same thing — or to the bare
      // fallback — and collide when exported on the same day
      const filename = `${toFileSlug(form.title, 'form')}-${form.id}-submissions-${new Date().toISOString().slice(0, 10)}.csv`;

      return new Response(`${CSV_BOM}${csv}`, {
        status: StatusCodes.OK,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    } catch (error) {
      req.payload.logger.error(
        `[formSubmissionsExport] Export failed: ${String(error)}`
      );
      return Response.json(
        { error: getReasonPhrase(StatusCodes.INTERNAL_SERVER_ERROR) },
        { status: StatusCodes.INTERNAL_SERVER_ERROR }
      );
    }
  }
};

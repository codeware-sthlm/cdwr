import {
  getPages,
  getPosts,
  getTours,
  mapToRuntime
} from '@codeware/app-cms/data-access';
import { canEdit } from '@codeware/app-cms/util/misc';
import type {
  PaletteSearchResponse,
  PaletteSearchResultItem
} from '@codeware/shared/util/payload-types';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import {
  type Endpoint,
  type PayloadRequest,
  type Where,
  headersWithCors
} from 'payload';

import { getTenantWhereFromHeaders } from '../components/admin/utils/tenant-where';

/** Matches returned per collection */
const RESULT_LIMIT = 5;

/** Queries shorter than this return empty results without hitting the DB */
const MIN_QUERY_LENGTH = 2;

/** Flat collections searchable without draft support */
type FlatSlug = 'media' | 'categories' | 'tags' | 'forms' | 'reusable-content';

/** Case-insensitive multi-field match combined with the tenant scope */
function searchWhere(
  fields: Array<string>,
  query: string,
  tenantWhere: Where | undefined
): Where {
  return {
    and: [
      ...(tenantWhere ? [tenantWhere] : []),
      { or: fields.map((field) => ({ [field]: { contains: query } })) }
    ]
  };
}

/**
 * Search a collection without drafts enabled, respecting access control.
 *
 * Same access semantics as the data-access collection functions —
 * inlined here since no other consumer needs list queries for these slugs.
 */
async function searchFlat<TSlug extends FlatSlug>(
  req: PayloadRequest,
  collection: TSlug,
  fields: Array<string>,
  query: string,
  tenantWhere: Where | undefined
) {
  const result = await req.payload.find({
    collection,
    where: searchWhere(fields, query, tenantWhere),
    limit: RESULT_LIMIT,
    depth: 0,
    sort: '-updatedAt',
    overrideAccess: false,
    user: req.user,
    disableErrors: true
  });
  return result.docs;
}

/**
 * Admin command palette search across content collections.
 *
 * Only accessible by authenticated admin users (editors and system admins);
 * tenant API-key identities and unauthenticated requests are rejected.
 * Results respect Payload access control and are scoped to the workspace
 * selected via the `payload-tenant` cookie, falling back to the user's
 * assigned tenants.
 *
 * Pages, posts and tours are queried in draft mode so never-published drafts
 * are found (their creation state in the main table may lack tenant/title).
 */
export const paletteSearchEndpoint: Endpoint = {
  path: '/palette-search',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!canEdit(req.user)) {
      return Response.json(
        { error: getReasonPhrase(StatusCodes.FORBIDDEN) },
        { status: StatusCodes.FORBIDDEN }
      );
    }

    const query =
      typeof req.query?.['q'] === 'string' ? req.query['q'].trim() : '';

    const respond = (results: Array<PaletteSearchResultItem>) => {
      const response: PaletteSearchResponse = { query, results };
      return Response.json(response, {
        status: StatusCodes.OK,
        headers: headersWithCors({ headers: new Headers(), req })
      });
    };

    if (query.length < MIN_QUERY_LENGTH) {
      return respond([]);
    }

    try {
      const runtime = mapToRuntime(req.payload, req.user);
      const tenantWhere = getTenantWhereFromHeaders(req.headers, req.user);
      const versionedOptions = {
        draft: true,
        limit: RESULT_LIMIT,
        depth: 0,
        sort: '-updatedAt'
      } as const;

      const [
        pages,
        posts,
        tours,
        media,
        categories,
        tags,
        forms,
        reusableContent
      ] = await Promise.all([
        getPages(runtime, {
          ...versionedOptions,
          where: searchWhere(['name', 'slug'], query, tenantWhere)
        }),
        getPosts(runtime, {
          ...versionedOptions,
          where: searchWhere(['title', 'slug'], query, tenantWhere)
        }),
        getTours(runtime, {
          ...versionedOptions,
          where: searchWhere(
            ['title', 'slug', 'destination'],
            query,
            tenantWhere
          )
        }),
        searchFlat(req, 'media', ['alt', 'filename'], query, tenantWhere),
        searchFlat(req, 'categories', ['name', 'slug'], query, tenantWhere),
        searchFlat(req, 'tags', ['name', 'slug'], query, tenantWhere),
        searchFlat(req, 'forms', ['title'], query, tenantWhere),
        searchFlat(req, 'reusable-content', ['title'], query, tenantWhere)
      ]);

      // Fixed collection order; the client groups by collection slug
      const results: Array<PaletteSearchResultItem> = [
        ...(pages?.docs ?? []).map((doc) => ({
          id: String(doc.id),
          title: doc.name ?? '',
          collectionSlug: 'pages' as const,
          status: doc._status ?? undefined,
          meta: doc.slug ?? undefined,
          updatedAt: doc.updatedAt
        })),
        ...(posts?.docs ?? []).map((doc) => ({
          id: String(doc.id),
          title: doc.title ?? '',
          collectionSlug: 'posts' as const,
          status: doc._status ?? undefined,
          meta: doc.slug ?? undefined,
          updatedAt: doc.updatedAt
        })),
        ...(tours?.docs ?? []).map((doc) => ({
          id: String(doc.id),
          title: doc.title ?? '',
          collectionSlug: 'tours' as const,
          status: doc._status ?? undefined,
          meta: doc.slug ?? undefined,
          updatedAt: doc.updatedAt
        })),
        ...media.map((doc) => ({
          id: String(doc.id),
          title: doc.alt || (doc.filename ?? ''),
          collectionSlug: 'media' as const,
          meta: doc.filename ?? undefined,
          updatedAt: doc.updatedAt
        })),
        ...categories.map((doc) => ({
          id: String(doc.id),
          title: doc.name,
          collectionSlug: 'categories' as const,
          meta: doc.slug ?? undefined,
          updatedAt: doc.updatedAt
        })),
        ...tags.map((doc) => ({
          id: String(doc.id),
          title: doc.name,
          collectionSlug: 'tags' as const,
          meta: doc.slug ?? undefined,
          updatedAt: doc.updatedAt
        })),
        ...forms.map((doc) => ({
          id: String(doc.id),
          title: doc.title,
          collectionSlug: 'forms' as const,
          updatedAt: doc.updatedAt
        })),
        ...reusableContent.map((doc) => ({
          id: String(doc.id),
          title: doc.title,
          collectionSlug: 'reusable-content' as const,
          updatedAt: doc.updatedAt
        }))
      ];

      return respond(results);
    } catch (error) {
      req.payload.logger.error(
        `[paletteSearch] Search failed: ${String(error)}`
      );
      return Response.json(
        { error: getReasonPhrase(StatusCodes.INTERNAL_SERVER_ERROR) },
        { status: StatusCodes.INTERNAL_SERVER_ERROR }
      );
    }
  }
};

import type { TranslationsKeys } from '@codeware/app-cms/util/i18n';
import type { CollectionSlug, Where } from 'payload';

/** Key under a collection's `admin.custom` holding its Content tab config */
export const relatedContentKey = 'relatedContent' as const;

/** A collection counted on a document, and the field that points at it. */
export type RelatedSource = {
  collection: CollectionSlug;
  path: string;
};

/** What a collection's Content tab counts and says. */
export type RelatedContentConfig = {
  /** Text above the counts */
  description: Extract<TranslationsKeys, `relatedContent:${string}`>;
  sources: ReadonlyArray<RelatedSource>;
  /**
   * The workspace a link selects before opening the list: the document itself
   * for a workspace, or the one the document belongs to.
   */
  workspace: 'self' | 'tenant';
};

/** Collections counted on a workspace, and the field that points at it. */
export const workspaceSources = [
  { collection: 'users', path: 'tenants.tenant' },
  { collection: 'pages', path: 'tenant' },
  { collection: 'posts', path: 'tenant' },
  { collection: 'categories', path: 'tenant' },
  { collection: 'media', path: 'tenant' }
] as const satisfies ReadonlyArray<RelatedSource>;

/** The Content tab config of a collection, when it has one. */
export const readRelatedContent = (
  custom: Record<string, unknown> | undefined
): RelatedContentConfig | undefined =>
  custom?.[relatedContentKey] as RelatedContentConfig | undefined;

/** The workspace a link selects, or `undefined` when the document has none. */
export const relatedWorkspaceId = (
  doc: Record<string, unknown> | undefined,
  workspace: RelatedContentConfig['workspace']
): number | string | undefined => {
  const value = workspace === 'self' ? doc?.id : doc?.tenant;
  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  // A populated relationship
  if (value && typeof value === 'object' && 'id' in value) {
    const { id } = value;
    return typeof id === 'number' || typeof id === 'string' ? id : undefined;
  }
  return undefined;
};

/** Admin list of a collection, filtered on the document. */
export const relatedListHref = ({
  adminRoute,
  collection,
  docId,
  path
}: RelatedSource & {
  adminRoute: string;
  docId: number | string;
}): string => {
  const query = new URLSearchParams({
    [`where[${path}][equals]`]: String(docId)
  });
  return `${adminRoute}/collections/${collection}?${query.toString()}`;
};

/** The `where` clause behind a count. */
export const relatedWhere = (path: string, docId: number | string): Where => ({
  [path]: { equals: docId }
});

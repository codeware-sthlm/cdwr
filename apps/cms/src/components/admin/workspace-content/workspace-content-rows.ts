import type { CollectionSlug, Where } from 'payload';

/** Collections counted on a workspace, and the field that points at it. */
export const workspaceSources = [
  { collection: 'users', path: 'tenants.tenant' },
  { collection: 'pages', path: 'tenant' },
  { collection: 'posts', path: 'tenant' },
  { collection: 'categories', path: 'tenant' },
  { collection: 'media', path: 'tenant' }
] as const satisfies ReadonlyArray<{
  collection: CollectionSlug;
  path: string;
}>;

type WorkspaceSource = (typeof workspaceSources)[number];

/** Admin list of a collection, filtered on the workspace. */
export const workspaceListHref = ({
  adminRoute,
  collection,
  path,
  tenantId
}: {
  adminRoute: string;
  collection: WorkspaceSource['collection'];
  path: WorkspaceSource['path'];
  tenantId: number | string;
}): string => {
  const query = new URLSearchParams({
    [`where[${path}][equals]`]: String(tenantId)
  });
  return `${adminRoute}/collections/${collection}?${query.toString()}`;
};

/** The `where` clause behind a count. */
export const workspaceWhere = (
  path: WorkspaceSource['path'],
  tenantId: number | string
): Where => ({ [path]: { equals: tenantId } });

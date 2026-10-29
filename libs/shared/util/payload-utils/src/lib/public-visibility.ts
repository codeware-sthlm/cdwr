import type { Where } from 'payload';

/** Value of the `visibility` field that anyone may read */
const PUBLIC = 'public';

/**
 * Documents anyone may read.
 *
 * A missing value counts as public: the field is required going forward and the
 * migration backfills it, so `null` can only mean a document predating the
 * field — and nothing was restricted before it existed. Treating `null` as
 * restricted would instead hide a whole site if a backfill were ever missed.
 */
export const publicVisibilityWhere: Where = {
  or: [{ visibility: { equals: PUBLIC } }, { visibility: { exists: false } }]
};

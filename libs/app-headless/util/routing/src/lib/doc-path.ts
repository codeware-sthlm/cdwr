/** Collections served under their own path segment; pages live at the root */
const segmentCollections = ['posts', 'tours'] as const;

/** What a cms slug can hold: the slug field keeps `[a-z0-9_-]`, `/` nests */
const slugSegment = /^[a-z0-9_-]+$/;

/** Longest path looked up; anything longer cannot be a slug */
export const maxPathLength = 512;

export type DocLookup = {
  /** `undefined` means a page */
  collection: (typeof segmentCollections)[number] | undefined;
  slug: string;
};

/**
 * What a request path asks for: `/posts/<slug>` and `/tours/<slug>` are those
 * collections, anything else is a page, nested slugs included (`/a/b` is the
 * page `a/b`), as on the cms site.
 *
 * @param splat - The path after the root, without a leading slash
 * @returns The lookup, or `null` for an empty path or one no slug can match
 */
export function resolveDocPath(splat: string | undefined): DocLookup | null {
  const path = splat ?? '';
  if (path.length > maxPathLength) {
    return null;
  }

  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0 || !segments.every((s) => slugSegment.test(s))) {
    return null;
  }

  const [first, ...rest] = segments;
  const collection = segmentCollections.find((name) => name === first);
  if (collection && rest.length > 0) {
    return { collection, slug: rest.join('/') };
  }

  return { collection: undefined, slug: segments.join('/') };
}

/** The path to look up and the locale the site runs in */
export type LoadDocInput = { splat: string; locale: string };

/** Anything that is not a plain short string is a miss, never a 500 */
export function parseLoadDocInput(input: unknown): LoadDocInput {
  const { splat, locale } = (input ?? {}) as Partial<LoadDocInput>;

  return {
    splat:
      typeof splat === 'string' && splat.length <= maxPathLength ? splat : '',
    locale: typeof locale === 'string' ? locale : 'en'
  };
}

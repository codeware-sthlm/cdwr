import type { ManagedCollectionSlug } from '@codeware/app-cms/util/definitions';
import type { SiteDefinition } from '@codeware/shared/util/seed';
import type { Payload } from 'payload';

import { type ExtraDocument, identifierField } from './find-extra-documents';

/** A document a fresh apply removed, or in a dry run would remove. */
export type RemovedDocument = {
  collection: ManagedCollectionSlug;
  /** The slug, filename or title the tenant knew it by */
  identifier: string;
  id: number;
};

/**
 * What a fresh apply does with each collection the definition owns.
 *
 * - `recreate` — everything the definition created is removed and created
 *   again, so edits made in the admin are replaced.
 * - `reuse` — what the definition still names is kept as it is, and only what
 *   it dropped is removed. Media is here because deleting it deletes its file
 *   outside the transaction, so a dry run or a failed apply would roll the row
 *   back and lose the file. Tags are here because reused media points at them:
 *   a recreated tag has a new id, and every file area built on it would empty.
 *
 * A `Record`, so a collection given `managedBy` without a policy fails the
 * build instead of being quietly skipped.
 */
export const FRESH_POLICY = {
  posts: 'recreate',
  pages: 'recreate',
  forms: 'recreate',
  categories: 'recreate',
  tags: 'reuse',
  media: 'reuse'
} as const satisfies Record<ManagedCollectionSlug, 'recreate' | 'reuse'>;

/**
 * The order recreated collections are removed in: whatever points at a
 * document goes before it. Posts reference categories; pages reference forms.
 */
const RECREATE_ORDER = ['posts', 'pages', 'forms', 'categories'] as const;

/** Every collection whose policy is `recreate` is in the order, and no other. */
type Ordered = (typeof RECREATE_ORDER)[number];
type Recreated = {
  [K in ManagedCollectionSlug]: (typeof FRESH_POLICY)[K] extends 'recreate'
    ? K
    : never;
}[ManagedCollectionSlug];
type SameSet = [Recreated] extends [Ordered]
  ? [Ordered] extends [Recreated]
    ? true
    : 'the removal order names a collection that is not recreated'
  : 'a recreated collection is missing from the removal order';
const orderCoversEveryRecreated: SameSet = true;
void orderCoversEveryRecreated;

/**
 * Remove everything a definition created in its recreated collections, so it
 * can be applied afresh.
 *
 * Only documents whose `managedBy` is this definition's name are touched. A
 * document with no `managedBy` — an editor's, or one created before the field
 * existed — is never removed by this or any other path; if the definition
 * names it, the apply that follows finds it and leaves it as it is.
 *
 * Runs inside the caller's transaction, so a dry run removes nothing. None of
 * these collections holds a file, which is what makes that true.
 *
 * @returns What was removed, in the order it was removed
 */
export async function removeRecreatedDocuments(
  payload: Payload,
  definition: SiteDefinition,
  tenantId: number,
  options: {
    transactionID: string | number | undefined;
    /** Pages to leave for the caller, such as the landing page being handed over */
    exceptPages?: ReadonlyArray<number>;
  }
): Promise<Array<RemovedDocument>> {
  const { transactionID, exceptPages = [] } = options;
  const removed: Array<RemovedDocument> = [];

  for (const collection of RECREATE_ORDER) {
    const { docs } = await payload.find({
      collection,
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { managedBy: { equals: definition.name } }
        ]
      },
      // Payload's unbounded query; a capped one would leave documents behind
      limit: 0,
      depth: 0,
      pagination: false,
      req: { transactionID }
    });

    for (const doc of docs) {
      if (collection === 'pages' && exceptPages.includes(doc.id as number)) {
        continue;
      }

      await payload.delete({ collection, id: doc.id, req: { transactionID } });

      const identifier = (doc as unknown as Record<string, unknown>)[
        identifierField[collection]
      ];
      removed.push({
        collection,
        identifier:
          typeof identifier === 'string' ? identifier : String(doc.id),
        id: doc.id as number
      });
    }
  }

  return removed;
}

/**
 * What a fresh apply removes from its reused collections: only what this
 * definition created and has since dropped. Everything it still names stays.
 *
 * @param extra - The tenant's extra documents, as `findExtraDocuments` reports
 */
export const droppedReusedDocuments = (
  extra: ReadonlyArray<ExtraDocument>
): Array<RemovedDocument> =>
  extra
    .filter(
      (
        document
      ): document is ExtraDocument & { collection: ManagedCollectionSlug } =>
        document.owner === 'this-definition' &&
        FRESH_POLICY[document.collection as ManagedCollectionSlug] === 'reuse'
    )
    .map(({ collection, identifier, id }) => ({ collection, identifier, id }));

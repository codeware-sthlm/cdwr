import type { ManagedCollectionSlug } from '@codeware/app-cms/util/definitions';
import type { SiteDefinition } from '@codeware/shared/util/seed';
import type { Payload } from 'payload';

import { identifierField } from './find-extra-documents';

/** A document a fresh apply removed before creating the definition again. */
export type RemovedDocument = {
  collection: ManagedCollectionSlug;
  /** The slug, filename or title the tenant knew it by */
  identifier: string;
  id: number;
};

/**
 * The order documents are removed in: whatever points at a document goes
 * before it. Posts reference categories and media; pages reference media and
 * forms; media references tags.
 */
const REMOVAL_ORDER = [
  'posts',
  'pages',
  'forms',
  'media',
  'categories',
  'tags'
] as const satisfies ReadonlyArray<ManagedCollectionSlug>;

/**
 * Every collection an apply stamps is swept here, and nothing else.
 *
 * A collection given `managedBy` but left out of this list would keep what a
 * definition dropped through every fresh apply — quietly. This fails the
 * build instead.
 */
type Swept = (typeof REMOVAL_ORDER)[number];
type ExactlyTheManaged = [ManagedCollectionSlug] extends [Swept]
  ? [Swept] extends [ManagedCollectionSlug]
    ? true
    : 'the removal order names a collection without managedBy'
  : 'a collection with managedBy is missing from the removal order';
const everyManagedCollectionIsSwept: ExactlyTheManaged = true;
void everyManagedCollectionIsSwept;

/**
 * Remove everything a definition created in a tenant, so it can be applied
 * afresh.
 *
 * Only documents whose `managedBy` is this definition's name are touched. A
 * document with no `managedBy` — an editor's, or one created before the field
 * existed — is never removed by this or any other path; if the definition
 * names it, the apply that follows finds it and leaves it as it is.
 *
 * Runs inside the caller's transaction, so a dry run removes nothing.
 *
 * @param payload - Payload instance
 * @param definition - The definition whose documents to remove
 * @param tenantId - The tenant to remove them from
 * @param options - The transaction to delete inside
 * @returns What was removed, in the order it was removed
 */
export async function removeManagedDocuments(
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

  for (const collection of REMOVAL_ORDER) {
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

      await payload.delete({
        collection,
        id: doc.id,
        req: { transactionID }
      });

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

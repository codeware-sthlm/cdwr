import { customT } from '@codeware/app-cms/util/i18n';
import { getTranslation } from '@payloadcms/translations';
import { Gutter, SetStepNav } from '@payloadcms/ui';
import { redirect } from 'next/navigation';
import type { CollectionSlug, ListViewServerProps } from 'payload';
import { formatAdminURL } from 'payload/shared';
import React from 'react';

import { singleDocTarget } from './single-doc-target';

/**
 * List view for a collection that only ever holds one document: sends the
 * viewer straight to it, or to the create view when it does not exist yet.
 *
 * Reads the document from the page Payload already fetched, and queries only
 * when that page is empty, since a `?where=` filter can empty it while the
 * row exists.
 *
 * Payload renders the same list component inside a relationship drawer, where
 * the redirect would navigate the editor away. Register this view only on
 * collections no relationship field points at.
 */
const SingleDocListView: React.FC<ListViewServerProps> = async ({
  collectionConfig,
  data,
  hasCreatePermission,
  i18n,
  newDocumentURL,
  payload,
  user
}) => {
  const slug = collectionConfig.slug as CollectionSlug;

  const listed: unknown = data?.docs?.[0]?.id;
  let docId: number | string | null =
    typeof listed === 'number' || typeof listed === 'string' ? listed : null;

  if (docId === null) {
    // A ?where= filter or a search can empty the page while the row exists
    const { docs } = await payload.find({
      collection: slug,
      depth: 0,
      limit: 1,
      pagination: false,
      user,
      overrideAccess: false
    });
    docId = docs[0]?.id ?? null;
  }

  const target = singleDocTarget({
    docURL:
      docId === null
        ? null
        : formatAdminURL({
            adminRoute: payload.config.routes.admin,
            path: `/collections/${slug}/${docId}`
          }),
    hasCreatePermission,
    newDocumentURL
  });

  if (target) {
    redirect(target);
  }

  const t = customT(i18n.t);
  const description = collectionConfig.admin?.description;

  return (
    <>
      <SetStepNav
        nav={[{ label: getTranslation(collectionConfig.labels.plural, i18n) }]}
      />
      <Gutter>
        {description && typeof description !== 'function' && (
          <p>{getTranslation(description, i18n)}</p>
        )}
        <p>{t('collection:singleDocMissing')}</p>
      </Gutter>
    </>
  );
};

export default SingleDocListView;

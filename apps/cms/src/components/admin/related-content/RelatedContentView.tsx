import { customT } from '@codeware/app-cms/util/i18n';
import { Card, CardContent } from '@codeware/shared/ui/shadcn/components/card';
import { getTranslation } from '@payloadcms/translations';
import { Gutter, SetStepNav } from '@payloadcms/ui';
import type { DocumentViewServerProps } from 'payload';
import React from 'react';

import {
  readRelatedContent,
  relatedListHref,
  relatedWhere,
  relatedWorkspaceId
} from './related-content';
import { RelatedListLink } from './RelatedListLink.client';

/**
 * Document tab showing how much content points at the document: what belongs
 * to a workspace, or what uses a category or a tag. The collection names its
 * sources in `admin.custom` (`relatedContentAdmin`).
 *
 * Runs only when the tab is opened. Counts respect the viewer's access, and a
 * count that is refused shows a dash instead of failing the view.
 */
const RelatedContentView: React.FC<DocumentViewServerProps> = async ({
  doc,
  i18n,
  initPageResult,
  payload
}) => {
  const t = customT(i18n.t);
  const adminRoute = payload.config.routes?.admin ?? '/admin';
  const collectionConfig = initPageResult.collectionConfig;
  const slug = collectionConfig?.slug ?? '';
  const config = readRelatedContent(collectionConfig?.admin?.custom);
  const docId = doc?.id as number | string | undefined;
  const titleField = collectionConfig?.admin?.useAsTitle ?? 'id';
  const title =
    typeof doc?.[titleField] === 'string' ? doc[titleField] : undefined;
  const tenantId = config
    ? relatedWorkspaceId(doc, config.workspace)
    : undefined;

  const collectionLabel = getTranslation(
    collectionConfig?.labels?.plural ?? slug,
    i18n
  );

  const rows =
    docId === undefined || !config
      ? []
      : await Promise.all(
          config.sources.map(async ({ collection, path }) => {
            const count = await payload
              .count({
                collection,
                where: relatedWhere(path, docId),
                overrideAccess: false,
                // The request's own user; the `user` prop is reduced by field access
                req: initPageResult.req
              })
              .then(({ totalDocs }) => totalDocs)
              .catch((error: unknown) => {
                payload.logger.warn(
                  { err: error },
                  `Related content: could not count ${collection} on ${slug}`
                );
                return null;
              });

            return {
              collection,
              count,
              label: getTranslation(
                payload.collections[collection].config.labels.plural,
                i18n
              ),
              href: relatedListHref({ adminRoute, collection, docId, path })
            };
          })
        );

  return (
    <div className="collection-default collection-default--related-content">
      <SetStepNav
        nav={[
          { label: collectionLabel, url: `${adminRoute}/collections/${slug}` },
          { label: title ?? '' }
        ]}
      />
      <Gutter>
        <div className="codeware-admin twp text-foreground">
          {docId === undefined || !config ? (
            <p>{t('relatedContent:unsaved')}</p>
          ) : (
            <>
              <p className="text-muted-foreground mb-4">
                {t(config.description)}
              </p>
              <Card>
                <CardContent>
                  <ul className="divide-border divide-y">
                    {rows.map(({ collection, count, label, href }) => (
                      <li
                        key={collection}
                        className="flex items-center justify-between py-3"
                      >
                        <span>{label}</span>
                        <RelatedListLink
                          href={href}
                          tenantId={tenantId}
                          className="tabular-nums underline underline-offset-4"
                          ariaLabel={`${label}: ${count ?? '–'}. ${t('relatedContent:open')}`}
                        >
                          {count ?? '–'}
                        </RelatedListLink>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </Gutter>
    </div>
  );
};

export default RelatedContentView;

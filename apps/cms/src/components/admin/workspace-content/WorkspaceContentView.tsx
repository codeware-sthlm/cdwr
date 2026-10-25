import { customT } from '@codeware/app-cms/util/i18n';
import { Card, CardContent } from '@codeware/shared/ui/shadcn/components/card';
import { getTranslation } from '@payloadcms/translations';
import { Gutter, SetStepNav } from '@payloadcms/ui';
import type { DocumentViewServerProps } from 'payload';
import React from 'react';

import {
  workspaceListHref,
  workspaceSources,
  workspaceWhere
} from './workspace-content-rows';
import { WorkspaceListLink } from './WorkspaceListLink.client';

/**
 * Document tab on a workspace showing how much content belongs to it.
 *
 * Runs only when the tab is opened. Counts respect the viewer's access, and a
 * count that is refused shows a dash instead of failing the view.
 */
const WorkspaceContentView: React.FC<DocumentViewServerProps> = async ({
  doc,
  i18n,
  initPageResult,
  payload
}) => {
  const t = customT(i18n.t);
  const adminRoute = payload.config.routes?.admin ?? '/admin';
  const slug = initPageResult.collectionConfig?.slug ?? 'tenants';
  const tenantId = doc?.id;
  const title = typeof doc?.name === 'string' ? doc.name : undefined;

  const collectionLabel = getTranslation(
    initPageResult.collectionConfig?.labels?.plural ?? slug,
    i18n
  );

  const rows =
    tenantId === undefined
      ? []
      : await Promise.all(
          workspaceSources.map(async ({ collection, path }) => {
            const count = await payload
              .count({
                collection,
                where: workspaceWhere(path, tenantId),
                overrideAccess: false,
                // The request's own user; the `user` prop is reduced by field access
                req: initPageResult.req
              })
              .then(({ totalDocs }) => totalDocs)
              .catch((error: unknown) => {
                payload.logger.warn(
                  { err: error },
                  `Workspace content: could not count ${collection}`
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
              href: workspaceListHref({
                adminRoute,
                collection,
                path,
                tenantId
              })
            };
          })
        );

  return (
    <div className="collection-default collection-default--workspace-content">
      <SetStepNav
        nav={[
          { label: collectionLabel, url: `${adminRoute}/collections/${slug}` },
          { label: title ?? '' }
        ]}
      />
      <Gutter>
        <div className="codeware-admin twp text-foreground">
          {tenantId === undefined ? (
            <p>{t('workspaceContent:unsaved')}</p>
          ) : (
            <>
              <p className="text-muted-foreground mb-4">
                {t('workspaceContent:description')}
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
                        <WorkspaceListLink
                          href={href}
                          tenantId={tenantId}
                          className="tabular-nums underline underline-offset-4"
                          ariaLabel={`${label}: ${count ?? '–'}. ${t('workspaceContent:open')}`}
                        >
                          {count ?? '–'}
                        </WorkspaceListLink>
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

export default WorkspaceContentView;

import {
  getSiteSettingsForTenant,
  mapToRuntime
} from '@codeware/app-cms/data-access';
import { customT } from '@codeware/app-cms/util/i18n';
import { getId, hasNoAdminRoles } from '@codeware/app-cms/util/misc';
import type { Page, Tour } from '@codeware/shared/util/payload-types';
import type { I18nClient } from '@payloadcms/translations';
import Link from 'next/link';
import type { Payload, TypedUser } from 'payload';
import React from 'react';

import { getSingleTenantId } from '../utils/tenant-where';

type Props = {
  i18n: I18nClient;
  payload: Payload;
  /** The tour's own tenant, when it has one saved yet */
  tenant: Tour['tenant'];
  user: TypedUser | null | undefined;
};

/** A configured page is only doing its job once it is published */
const describe = (
  page: unknown
): { title: string; published: boolean } | null =>
  page && typeof page === 'object'
    ? {
        title: (page as Page).name ?? '',
        published: (page as Page)._status === 'published'
      }
    : null;

/**
 * Whether this workspace has the pages a signup form must link to.
 *
 * Shown next to the signup list because that is where the editor thinks about
 * signups — the settings themselves live elsewhere, and a privacy page that
 * was never published is invisible from here otherwise. It is the one part of
 * the signup flow that is configured once and then easy to forget.
 *
 * Scoped by the *tour's own* tenant, not the admin's currently selected
 * workspace: a system-user who opens a tour without having switched their
 * nav to its tenant has no tenant cookie set, and the session alone can't
 * say which tenant's settings apply. Falls back to a single unambiguous
 * tenant only when the tour has none yet, and renders nothing when even
 * that is ambiguous, rather than guess.
 */
export const LegalPagesStatus: React.FC<Props> = async ({
  i18n,
  payload,
  tenant,
  user
}) => {
  const t = customT(i18n.t);

  const tourTenantId = getId(tenant);
  const tenantId = tourTenantId || (await getSingleTenantId(user));

  if (!tenantId) {
    return null;
  }

  const runtime = mapToRuntime(payload, user ?? null);
  const settings = await getSiteSettingsForTenant(runtime, tenantId, {
    depth: 1
  });

  const privacy = describe(settings?.legal?.privacyPage);
  const terms = describe(settings?.legal?.termsPage);

  const adminRoute = payload.config.routes?.admin ?? '/admin';
  // Site settings is one document per workspace, so the useful link is that
  // document when it exists; the collection route falls back to Payload's
  // own list view (with a "create" action) for the rare tenant that has none
  const settingsHref = settings
    ? `${adminRoute}/collections/site-settings/${settings.id}`
    : `${adminRoute}/collections/site-settings`;
  // Same rule the collection itself uses to hide from the nav
  // (`site-settings.collection.ts`): a plain tenant user can read this
  // document but never save it, so a link here would only lead to a dead end
  const canEditSettings = !hasNoAdminRoles(user ?? null);

  const line = (label: string, page: ReturnType<typeof describe>) => (
    <span className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{label}:</span>
      {page ? (
        <>
          <span>{page.title}</span>
          {!page.published && (
            <span className="text-(--destructive-subtle)">
              ({t('tourSignups:legalDraft')})
            </span>
          )}
        </>
      ) : (
        <span className="text-(--destructive-subtle)">
          {t('tourSignups:legalMissing')}
        </span>
      )}
    </span>
  );

  return (
    <div className="codeware-admin twp border-border text-muted-foreground mb-6 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border px-3 py-2 text-sm">
      {line(t('tourSignups:privacyPage'), privacy)}
      {line(t('tourSignups:termsPage'), terms)}
      {canEditSettings && (
        <Link className="underline" href={settingsHref} prefetch={false}>
          {t('tourSignups:legalSettingsLink')}
        </Link>
      )}
    </div>
  );
};

export default LegalPagesStatus;

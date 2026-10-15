import {
  QueryMultipleOptions,
  countUnreadSubmissions,
  getCollectionCounts,
  getCountableSlugs,
  getPages,
  getPosts,
  getPreference,
  mapToRuntime
} from '@codeware/app-cms/data-access';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import type { RecentDoc } from '@codeware/app-cms/ui/dashboard';
import { hasRole } from '@codeware/app-cms/util/misc';
import type { SupportedLocale } from '@codeware/shared/util/i18n';
import type {
  CollectionSlug,
  Page,
  Post
} from '@codeware/shared/util/payload-types';
import type { ServerProps, Where } from 'payload';
import React from 'react';

import { getFirstSiteState } from '../first-site/first-site-access';
import { formatRelativeTime } from '../utils/relative-time';
import { getTenantWhere } from '../utils/tenant-where';

import { AdminDashboard } from './AdminDashboard.client';
import {
  DASHBOARD_PREFERENCES_KEY,
  DEFAULT_DASHBOARD_TAB,
  type DashboardPreferences,
  isDashboardTab
} from './dashboard-preferences';
import { getPlatformData } from './get-platform-data';
import { PANEL_MAX_LIMIT } from './panel-limits';

const SKIPPED_COUNT_SLUGS: Set<CollectionSlug> = new Set([
  // Multi-tenant globals only have one document by design
  'navigation',
  'site-settings'
] satisfies CollectionSlug[]);

const toRecentDoc = (
  doc: Post | Page,
  collectionSlug: 'posts' | 'pages'
): RecentDoc => ({
  id: String(doc.id),
  // New unpublished drafts may not have a name/title yet
  title: ('title' in doc ? doc.title : doc.name) ?? '',
  collectionSlug,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
  status: doc._status ?? undefined
});

const byUpdatedAtDesc = (a: RecentDoc, b: RecentDoc) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();

/**
 * Server-component wrapper for the custom admin dashboard.
 *
 * Fetches all data through the shared data-access layer (Payload local API,
 * access control applied via the authenticated runtime) and passes plain
 * serializable props to the client component.
 *
 * Payload passes non-serializable props (locale config with toString methods)
 * here — we consume them without forwarding them.
 */
const AdminDashboardView: React.FC<ServerProps> = async ({
  payload,
  user,
  locale
}) => {
  const runtime = mapToRuntime(payload, user);
  const tenantWhere = await getTenantWhere(user);

  // The platform tab is system-only, and one fact decides both whether it is
  // rendered and whether its data is fetched — two checks could drift into a
  // visible but empty tab, or a fetch nobody sees
  const canSeePlatform = hasRole(user ?? null, 'system-user');
  const draftsWhere: Where = {
    and: [
      ...(tenantWhere ? [tenantWhere] : []),
      { _status: { equals: 'draft' } }
    ]
  };

  // Query with `draft: true` so filters, sorting and returned data reflect
  // each document's newest version. Never-published documents keep their
  // creation state in the main table (e.g. `tenant` may still be null there),
  // so main-table queries would miss them once a workspace is selected.
  //
  // Each panel merges two collections, so fetch the panel maximum from both —
  // the client slices the merged list to the user's selected limit.
  const listOptions: QueryMultipleOptions<'pages' | 'posts'> = {
    draft: true,
    locale: locale?.code as SupportedLocale,
    where: tenantWhere,
    limit: PANEL_MAX_LIMIT,
    sort: '-updatedAt',
    depth: 0
  };
  const draftOptions: QueryMultipleOptions<'pages' | 'posts'> = {
    ...listOptions,
    where: draftsWhere
  };

  // Count only the collections visible to this user (respecting access control).
  // The tenant scope is applied per-collection inside `getCollectionCounts`, so
  // non-tenant collections (faq) keep their count when a workspace is selected.
  const slugsToCount = getCountableSlugs(payload, user, {
    skip: SKIPPED_COUNT_SLUGS
  });

  // Resolve the last-used tab server-side so the client seeds `useState` with
  // it directly — no mount-time effect, so no flash to the default tab.
  const resolveActiveTab = async () => {
    const preferences = await getPreference<DashboardPreferences>(
      runtime,
      DASHBOARD_PREFERENCES_KEY
    );
    const stored = preferences?.activeTab;
    if (!isDashboardTab(stored)) {
      return DEFAULT_DASHBOARD_TAB;
    }
    // A user demoted since they last chose the platform tab would otherwise be
    // handed a value no trigger matches, which renders a blank pane in silence
    return stored === 'platform' && !canSeePlatform
      ? DEFAULT_DASHBOARD_TAB
      : stored;
  };

  const [
    counts,
    unreadSubmissions,
    recentPosts,
    recentPages,
    draftPosts,
    draftPages,
    activeTab,
    platform
  ] = await Promise.all([
    getCollectionCounts(runtime, slugsToCount, { tenantWhere }),
    countUnreadSubmissions(runtime, { tenantWhere }),
    getPosts(runtime, listOptions),
    getPages(runtime, listOptions),
    getPosts(runtime, draftOptions),
    getPages(runtime, draftOptions),
    resolveActiveTab(),
    // `getEnv()` revalidates the whole environment on every call, so it is
    // parsed once here and handed down rather than read per widget
    canSeePlatform
      ? getPlatformData(payload, user, getEnv(), (checkedAt) =>
          formatRelativeTime(checkedAt, locale?.code ?? 'en')
        )
      : null
  ]);

  // The messages task counts unread rather than everything ever received, so
  // the number falls as the editor works through them. Only the task card
  // switches — the All-content card keeps showing how many the collection holds
  const taskCounts: Record<string, number> =
    'form-submissions' in counts && unreadSubmissions !== null
      ? { 'form-submissions': unreadSubmissions }
      : {};

  const recentDocs = [
    ...(recentPosts?.docs ?? []).map((doc) => toRecentDoc(doc, 'posts')),
    ...(recentPages?.docs ?? []).map((doc) => toRecentDoc(doc, 'pages'))
  ]
    .sort(byUpdatedAtDesc)
    .slice(0, PANEL_MAX_LIMIT);

  const drafts = [
    ...(draftPosts?.docs ?? []).map((doc) => toRecentDoc(doc, 'posts')),
    ...(draftPages?.docs ?? []).map((doc) => toRecentDoc(doc, 'pages'))
  ]
    .sort(byUpdatedAtDesc)
    .slice(0, PANEL_MAX_LIMIT);

  const userName = user?.name ?? '';
  const showBuildSite =
    (await getFirstSiteState(payload, user)).kind === 'available';

  return (
    <AdminDashboard
      userName={userName}
      counts={counts}
      taskCounts={taskCounts}
      recentDocs={recentDocs}
      drafts={drafts}
      initialActiveTab={activeTab}
      platform={platform}
      showBuildSite={showBuildSite}
    />
  );
};

export default AdminDashboardView;

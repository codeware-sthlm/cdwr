'use client';

import {
  type DashboardData,
  DocRow,
  EmptyState,
  GettingStartedCard,
  LimitToggle,
  type RecentDoc,
  TaskCard,
  getSlugIcon
} from '@codeware/app-cms/ui/dashboard';
import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle
} from '@codeware/shared/ui/shadcn/components/card';
import type { User } from '@codeware/shared/util/payload-types';
import {
  ClockIcon,
  PencilSquareIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import { useAuth, useTranslation } from '@payloadcms/ui';
import Link from 'next/link';

import { formatRelativeTime } from '../utils/relative-time';
import { useCollectionLabel } from '../utils/use-collection-label';

import { hasCreatePermission } from './has-create-permission';
import { PANEL_LIMIT_OPTIONS } from './panel-limits';
import { TASKS } from './tasks';
import { useGettingStarted } from './use-getting-started';
import { usePanelLimits } from './use-panel-limits';

/** Badge for a doc: "New" right after creation, otherwise its publish status. */
function badgeKey(doc: RecentDoc): TranslationsKeys | undefined {
  const created = new Date(doc.createdAt).getTime();
  const updated = new Date(doc.updatedAt).getTime();
  if (
    Number.isFinite(created) &&
    Number.isFinite(updated) &&
    updated - created < 60_000
  ) {
    return 'dashboard:badgeNew';
  }
  if (doc.status === 'published') return 'dashboard:badgePublished';
  if (doc.status === 'draft') return 'dashboard:badgeDraft';
  return undefined;
}

/**
 * Dashboard Home tab: greeting, first-time checklist, quick-task grid and the
 * recent-activity/drafts panels.
 *
 * Presentational — checklist and panel-limit behavior live in dedicated hooks.
 */
export function HomeTab({
  userName,
  counts,
  taskCounts,
  recentDocs,
  drafts
}: Pick<
  DashboardData,
  'userName' | 'counts' | 'taskCounts' | 'recentDocs' | 'drafts'
>) {
  const { permissions } = useAuth<User>();
  const collectionLabel = useCollectionLabel();
  const { i18n, t } = useTranslation<TranslationsObject, TranslationsKeys>();

  const { recentLimit, draftsLimit, changeRecentLimit, changeDraftsLimit } =
    usePanelLimits();
  const { showChecklist, checklistSteps, dismissChecklist } =
    useGettingStarted(counts);

  const language = i18n.language;

  const visibleRecent = recentDocs.slice(0, recentLimit);
  const visibleDrafts = drafts.slice(0, draftsLimit);

  const docMeta = (doc: RecentDoc, draft?: boolean) =>
    [
      collectionLabel(doc.collectionSlug),
      ...(draft ? [t('dashboard:badgeDraft')] : []),
      formatRelativeTime(doc.updatedAt, language)
    ].join(' · ');

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-foreground text-2xl leading-tight font-semibold tracking-tight">
          {t('dashboard:heading')}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-prose text-sm leading-relaxed">
          {t('dashboard:lead', { name: userName })}
        </p>
      </div>

      {/* First-time editor checklist */}
      {showChecklist && (
        <GettingStartedCard
          title={t('dashboard:gettingStartedTitle')}
          subtitle={t('dashboard:gettingStartedSub')}
          dismissLabel={t('dashboard:gettingStartedDismiss')}
          steps={checklistSteps}
          onDismiss={dismissChecklist}
          linkComponent={Link}
        />
      )}

      {/* Task grid — create tasks are hidden without create permission */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {TASKS.filter(
          (task) =>
            !task.createSlug ||
            hasCreatePermission(permissions, task.createSlug)
        ).map((task) => {
          const count = task.countSlug
            ? (taskCounts[task.countSlug] ?? counts[task.countSlug])
            : undefined;
          const description =
            task.countSubKey && count
              ? t(task.countSubKey, { count })
              : t(task.subKey);
          return (
            <TaskCard
              key={task.href}
              href={task.href}
              label={t(task.labelKey)}
              description={description}
              icon={task.icon}
              linkComponent={Link}
            />
          );
        })}
      </div>

      {/* Activity + Drafts row */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.55fr_1fr]">
        {/* Recent activity */}
        <Card variant="bordered" className="gap-0 py-0">
          <CardHeader className="border-border border-b py-3 [.border-b]:pb-3">
            <CardTitle className="text-sm font-semibold">
              {t('dashboard:recentActivity')}
            </CardTitle>
            {recentDocs.length > 0 && (
              <CardAction>
                <LimitToggle
                  label={t('dashboard:limitLabel')}
                  options={PANEL_LIMIT_OPTIONS}
                  value={recentLimit}
                  onValueChange={changeRecentLimit}
                />
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="p-2">
            {recentDocs.length === 0 ? (
              <EmptyState
                icon={ClockIcon}
                title={t('dashboard:emptyActivityTitle')}
                description={t('dashboard:emptyActivitySub')}
              />
            ) : (
              <div className="flex flex-col">
                {visibleRecent.map((doc) => (
                  <DocRow
                    key={`${doc.collectionSlug}-${doc.id}`}
                    href={`/admin/collections/${doc.collectionSlug}/${doc.id}`}
                    title={doc.title || t('general:untitled')}
                    meta={docMeta(doc)}
                    icon={getSlugIcon(doc.collectionSlug)}
                    badgeLabel={(() => {
                      const key = badgeKey(doc);
                      return key ? t(key) : undefined;
                    })()}
                    linkComponent={Link}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Continue editing */}
        <Card variant="bordered" className="gap-0 py-0">
          <CardHeader className="border-border border-b py-3 [.border-b]:pb-3">
            <CardTitle className="text-sm font-semibold">
              {t('dashboard:continueEditing')}
            </CardTitle>
            {drafts.length > 0 && (
              <CardAction>
                <LimitToggle
                  label={t('dashboard:limitLabel')}
                  options={PANEL_LIMIT_OPTIONS}
                  value={draftsLimit}
                  onValueChange={changeDraftsLimit}
                />
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="p-2">
            {drafts.length === 0 ? (
              <EmptyState
                icon={PencilSquareIcon}
                title={t('dashboard:emptyDraftsTitle')}
                description={t('dashboard:emptyDraftsSub')}
              >
                <Button asChild variant="outline" size="sm">
                  <Link href="/admin/collections/posts/create">
                    <PlusIcon aria-hidden />
                    {t('dashboard:emptyCta')}
                  </Link>
                </Button>
              </EmptyState>
            ) : (
              <div className="flex flex-col">
                {visibleDrafts.map((doc) => (
                  <DocRow
                    key={`draft-${doc.collectionSlug}-${doc.id}`}
                    href={`/admin/collections/${doc.collectionSlug}/${doc.id}`}
                    title={doc.title || t('general:untitled')}
                    meta={docMeta(doc, true)}
                    icon={getSlugIcon(doc.collectionSlug)}
                    linkComponent={Link}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

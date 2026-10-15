'use client';

import type { DashboardData } from '@codeware/app-cms/ui/dashboard';
import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@codeware/shared/ui/shadcn/components/tabs';
import { useTranslation } from '@payloadcms/ui';
import React from 'react';

import { AllContentTab } from './AllContentTab.client';
import { HomeTab } from './HomeTab.client';
import { PlatformTab } from './PlatformTab.client';
import { useActiveTab } from './use-active-tab';

/*
 * Underline tabs on the `line` TabsList variant (kills the default variant's
 * active bg/shadow box). The underline is our own bottom border instead of
 * the variant's `after:` bar; the dark `group-data-[variant=line]` override
 * must be spelled out at the same specificity as the base class it replaces.
 */
const TAB_TRIGGER_CLASSES =
  'text-muted-foreground hover:text-foreground -mb-px h-auto flex-none rounded-none border-0 border-b-2 border-transparent px-0 py-3.5 text-sm font-semibold transition-colors after:hidden data-active:border-(--link) data-active:text-foreground dark:data-active:border-(--link) dark:group-data-[variant=line]/tabs-list:data-active:border-(--link)';

/**
 * Custom admin dashboard: the tabbed shell hosting the Home, All-content and
 * Platform tabs.
 *
 * Presentational container — tab behavior and each tab's data handling live
 * in dedicated hooks and tab components.
 */
export const AdminDashboard: React.FC<DashboardData> = ({
  userName,
  counts,
  taskCounts,
  recentDocs,
  drafts,
  initialActiveTab,
  platform,
  showBuildSite
}) => {
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const { activeTab, changeTab } = useActiveTab(initialActiveTab);

  return (
    /* `codeware-admin` is a structural marker only (scopes payload-retheme
       selectors like the tenant selector); shadcn tokens come from the
       payload-admin theme at :root. `twp` pins the Tailwind px scale. */
    /* The view renders below Payload's toolbar inside `.template-default__wrap`,
       so a plain `h-full` makes it one toolbar-height too tall — the overflow
       pushes the tab strip up under the toolbar. Claim only what's left. */
    <div className="codeware-admin twp bg-background text-foreground flex h-[calc(100%-var(--app-header-height))] flex-col">
      {/* The gap to the toolbar sits above the whole strip, not inside it:
       * padding on the TabsList would push the triggers down while leaving its
       * bottom border (the divider) behind, collapsing the space under the
       * labels. The triggers keep their own symmetric `py`. */}
      <Tabs
        value={activeTab}
        onValueChange={changeTab}
        className="flex h-full flex-col gap-0 pt-4"
      >
        <TabsList
          variant="line"
          className="border-border h-auto w-full justify-start gap-6 rounded-none border-b px-7.5 py-0"
        >
          <TabsTrigger value="home" className={TAB_TRIGGER_CLASSES}>
            {t('dashboard:tabHome')}
          </TabsTrigger>
          <TabsTrigger value="content" className={TAB_TRIGGER_CLASSES}>
            {t('dashboard:tabAllContent')}
          </TabsTrigger>
          {/* Present only for whoever runs the platform. The same `platform`
              value decides this and whether the data was fetched at all, so
              the two cannot drift into a tab with nothing behind it. */}
          {platform && (
            <TabsTrigger value="platform" className={TAB_TRIGGER_CLASSES}>
              {t('dashboard:tabPlatform')}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent
          value="home"
          className="mt-0 flex-1 overflow-y-auto px-7.5 pt-7 pb-10"
        >
          <HomeTab
            userName={userName}
            counts={counts}
            taskCounts={taskCounts}
            recentDocs={recentDocs}
            drafts={drafts}
            showBuildSite={showBuildSite}
          />
        </TabsContent>
        <TabsContent
          value="content"
          className="mt-0 flex-1 overflow-y-auto px-7.5 pt-7 pb-10"
        >
          <AllContentTab counts={counts} />
        </TabsContent>
        {platform && (
          <TabsContent
            value="platform"
            className="mt-0 flex-1 overflow-y-auto px-7.5 pt-7 pb-10"
          >
            <PlatformTab data={platform} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default AdminDashboard;

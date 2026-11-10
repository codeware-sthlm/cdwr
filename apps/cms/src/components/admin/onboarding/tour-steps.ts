import type { IconComponent } from '@codeware/app-cms/ui/dashboard';
import type { FaqTopic } from '@codeware/app-cms/util/definitions';
import type { TranslationsKeys } from '@codeware/app-cms/util/i18n';
import {
  Bars3Icon,
  ChartBarIcon,
  ClockIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  UserCircleIcon
} from '@heroicons/react/24/outline';
import type { useAuth } from '@payloadcms/ui';
import type { CollectionSlug } from 'payload';

import { hasUpdatePermission } from '../dashboard/has-create-permission';

/** Where a step's "Show me" button leads: an admin url, or the command palette. */
export type TourShowMe = { href: string } | 'palette';

/**
 * The colour a step is drawn in: the theme's chart hues, so each step has its
 * own and every theme supplies them in both colour schemes.
 */
export type TourTone =
  'chart-1' | 'chart-2' | 'chart-3' | 'chart-4' | 'chart-5' | 'primary';

/** One step of the onboarding tour, leading into the FAQ topic of the same name. */
export type TourStep = {
  topic: FaqTopic;
  icon: IconComponent;
  tone: TourTone;
  titleKey: TranslationsKeys;
  bodyKey: TranslationsKeys;
  /** Without it the step has no "Show me" button. */
  showMe?: TourShowMe;
  /** The step is skipped unless the user can update documents here. */
  requires?: CollectionSlug;
};

/** A "Read more" link on the closing card. */
export type TourMoreLink = {
  topic: FaqTopic;
  icon: IconComponent;
  tone: TourTone;
  titleKey: TranslationsKeys;
  bodyKey: TranslationsKeys;
};

/** The tour's steps, in the order the FAQ topics list them. */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    topic: 'pages',
    icon: DocumentTextIcon,
    tone: 'chart-1',
    titleKey: 'onboarding:pagesTitle',
    bodyKey: 'onboarding:pagesBody',
    showMe: { href: '/admin/collections/pages' },
    requires: 'pages'
  },
  {
    topic: 'drafts',
    icon: ClockIcon,
    tone: 'chart-5',
    titleKey: 'onboarding:draftsTitle',
    bodyKey: 'onboarding:draftsBody',
    requires: 'pages'
  },
  {
    topic: 'navigation',
    icon: Bars3Icon,
    tone: 'chart-3',
    titleKey: 'onboarding:navigationTitle',
    bodyKey: 'onboarding:navigationBody',
    // The list view redirects a single-document collection to its document
    showMe: { href: '/admin/collections/navigation' },
    requires: 'navigation'
  },
  {
    topic: 'site-settings',
    icon: Cog6ToothIcon,
    tone: 'chart-2',
    titleKey: 'onboarding:siteSettingsTitle',
    bodyKey: 'onboarding:siteSettingsBody',
    showMe: { href: '/admin/collections/site-settings' },
    requires: 'site-settings'
  },
  {
    topic: 'search-help',
    icon: MagnifyingGlassIcon,
    tone: 'chart-4',
    titleKey: 'onboarding:searchHelpTitle',
    bodyKey: 'onboarding:searchHelpBody',
    showMe: 'palette'
  }
];

/** The closing card's links, shown to everyone. */
export const TOUR_MORE: readonly TourMoreLink[] = [
  {
    topic: 'account',
    icon: UserCircleIcon,
    tone: 'chart-5',
    titleKey: 'onboarding:accountTitle',
    bodyKey: 'onboarding:accountBody'
  },
  {
    topic: 'statistics',
    icon: ChartBarIcon,
    tone: 'chart-3',
    titleKey: 'onboarding:statisticsTitle',
    bodyKey: 'onboarding:statisticsBody'
  }
];

/** The steps the user can follow: those whose area they can't change are skipped. */
export const visibleTourSteps = (
  permissions: ReturnType<typeof useAuth>['permissions']
): TourStep[] =>
  TOUR_STEPS.filter(
    ({ requires }) => !requires || hasUpdatePermission(permissions, requires)
  );

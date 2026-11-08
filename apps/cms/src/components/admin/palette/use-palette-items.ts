'use client';

import {
  type IconComponent,
  getSlugIcon
} from '@codeware/app-cms/ui/dashboard';
import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import type { User } from '@codeware/shared/util/payload-types';
import {
  ArrowsRightLeftIcon,
  BuildingOffice2Icon,
  DocumentIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  HomeIcon,
  InformationCircleIcon,
  LanguageIcon,
  MoonIcon,
  PhotoIcon,
  QuestionMarkCircleIcon,
  RocketLaunchIcon,
  SunIcon
} from '@heroicons/react/24/outline';
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client';
import { getTranslation } from '@payloadcms/translations';
import {
  useAuth,
  useConfig,
  useLocale,
  usePreferences,
  useRouteTransition,
  useTheme,
  useTranslation
} from '@payloadcms/ui';
import { useRouter } from 'next/navigation';
import type { CollectionSlug } from 'payload';

import { OPEN_ABOUT_EVENT } from '../AboutDialogHost.client';
import {
  DASHBOARD_PREFERENCES_KEY,
  type DashboardPreferences
} from '../dashboard/dashboard-preferences';
import { hasCreatePermission } from '../dashboard/has-create-permission';
import { SHOW_GETTING_STARTED_EVENT } from '../dashboard/use-getting-started';
import { openHelp } from '../help-events';
import { useCollectionLabel } from '../utils/use-collection-label';
import { useVisibleCollections } from '../utils/use-visible-collections';

/** A selectable palette command (action, navigation target or workspace). */
export type PaletteCommandItem = {
  /** The unique value for the command item. */
  value: string;
  /** The display label for the command item. */
  label: string;
  /** The icon component for the command item. */
  icon: IconComponent;
  /** The function to run when the command item is selected. */
  run: () => void;
  /** Only set for workspace items, to render the current-tenant checkmark. */
  checked?: boolean;
};

/**
 * Actions for creating new documents. Only offered for collections the user can
 * both see and create in — the same gate as the dashboard's task cards, so we
 * never surface an action the user can't complete.
 */
const CREATE_ACTIONS: {
  labelKey: TranslationsKeys;
  slug: CollectionSlug;
  icon: IconComponent;
}[] = [
  { labelKey: 'nav:newBlogPost', slug: 'posts', icon: DocumentTextIcon },
  { labelKey: 'nav:newPage', slug: 'pages', icon: DocumentIcon },
  { labelKey: 'nav:uploadMedia', slug: 'media', icon: PhotoIcon }
];

/**
 * Builds the palette's static command view-models from the current query:
 * quick actions, navigation targets and workspace switches.
 *
 * Each item carries its own `run` side effect (routing, color scheme toggle, tenant
 * switch, custom events) so the dialog stays presentational. Filtering mirrors
 * cmdk's client-side matching — the dialog runs with `shouldFilter={false}`
 * because server document results arrive pre-filtered.
 *
 * @param query - The raw palette input.
 */
export function usePaletteItems(query: string): {
  actionItems: PaletteCommandItem[];
  navigationItems: PaletteCommandItem[];
  workspaceItems: PaletteCommandItem[];
  hasStaticMatches: boolean;
} {
  const { permissions, user } = useAuth<User>();
  const collectionLabel = useCollectionLabel();
  const { setPreference } = usePreferences();
  const router = useRouter();
  const {
    options: tenantOptions,
    selectedTenantID,
    setTenant
  } = useTenantSelection();
  const { setTheme: setColorScheme, theme: colorScheme } = useTheme();
  const { config } = useConfig();
  const locale = useLocale();
  const { startRouteTransition } = useRouteTransition();
  const { i18n, languageOptions, switchLanguage, t } = useTranslation<
    TranslationsObject,
    TranslationsKeys
  >();
  const visibleCollections = useVisibleCollections();

  const queryToSearch = query.trim().toLowerCase();
  /** Check if a label matches the current query */
  const matches = (label: string) =>
    !queryToSearch || label.toLowerCase().includes(queryToSearch);

  const colorSchemeLabel = t(
    colorScheme === 'light' ? 'nav:colorSchemeDark' : 'nav:colorSchemeLight'
  );
  const ColorSchemeIcon = colorScheme === 'light' ? MoonIcon : SunIcon;

  // Interface (UI) language switches — offer only languages other than the
  // current one, mirroring the single-target color scheme toggle.
  const languageItems: PaletteCommandItem[] = (
    switchLanguage ? languageOptions : []
  )
    .filter((option) => option.value !== i18n.language)
    .map((option) => ({
      value: `language:${option.value}`,
      label: `${t('nav:interfaceLanguage')}: ${option.label}`,
      icon: LanguageIcon,
      run: () => {
        void switchLanguage?.(option.value);
      }
    }))
    .filter(({ label }) => matches(label));

  // Content-locale switches — same effect as the toolbar pill: swap the
  // `locale` query param, preserving the others. Offer only other locales.
  const locales = config.localization ? config.localization.locales : [];
  const localeItems: PaletteCommandItem[] =
    locale && locales.length > 1
      ? locales
          .filter((option) => option.code !== locale.code)
          .map((option) => ({
            value: `locale:${option.code}`,
            label: `${t('nav:contentLocaleAria')}: ${getTranslation(
              option.label,
              i18n
            )}`,
            icon: GlobeAltIcon,
            run: () => {
              const params = new URLSearchParams(window.location.search);
              params.set('locale', option.code);
              startRouteTransition(() =>
                router.push(`${window.location.pathname}?${params.toString()}`)
              );
            }
          }))
          .filter(({ label }) => matches(label))
      : [];

  const creatableSlugs = new Set(visibleCollections().map((col) => col.slug));

  const actionItems: PaletteCommandItem[] = [
    // Create new document actions
    ...CREATE_ACTIONS.filter(
      ({ labelKey, slug }) =>
        creatableSlugs.has(slug) &&
        hasCreatePermission(permissions, slug) &&
        matches(t(labelKey))
    ).map(({ labelKey, slug, icon }) => {
      const href = `/admin/collections/${slug}/create`;
      return {
        value: `action:${href}`,
        label: t(labelKey),
        icon,
        run: () => {
          router.push(href);
        }
      };
    }),
    // Color scheme toggle action (always present)
    ...(matches(colorSchemeLabel)
      ? [
          {
            value: 'action:toggle-color-scheme',
            label: colorSchemeLabel,
            icon: ColorSchemeIcon,
            run: () => {
              setColorScheme(colorScheme === 'light' ? 'dark' : 'light');
            }
          }
        ]
      : []),
    // Interface language and content locale switches (clustered with color scheme)
    ...languageItems,
    ...localeItems,
    // Help action (always present)
    ...(matches(t('palette:actionHelp'))
      ? [
          {
            value: 'action:open-help',
            label: t('palette:actionHelp'),
            icon: QuestionMarkCircleIcon,
            run: () => {
              openHelp();
            }
          }
        ]
      : []),
    // About action (always present)
    ...(matches(t('palette:actionAbout'))
      ? [
          {
            value: 'action:open-about',
            label: t('palette:actionAbout'),
            icon: InformationCircleIcon,
            run: () => {
              window.dispatchEvent(new CustomEvent(OPEN_ABOUT_EVENT));
            }
          }
        ]
      : []),
    // The getting started checklist only exists for editors; system admins never see it
    ...(user?.role !== 'system-user' &&
    matches(t('palette:actionGettingStarted'))
      ? [
          {
            value: 'action:show-getting-started',
            label: t('palette:actionGettingStarted'),
            icon: RocketLaunchIcon,
            run: () => {
              // Clear the stored dismissal (covers a fresh dashboard mount),
              // nudge an already-mounted dashboard, then go there
              void setPreference<DashboardPreferences>(
                DASHBOARD_PREFERENCES_KEY,
                { gettingStartedDismissed: false },
                true
              );
              window.dispatchEvent(new CustomEvent(SHOW_GETTING_STARTED_EVENT));
              router.push('/admin');
            }
          }
        ]
      : [])
  ];

  const navigationItems: PaletteCommandItem[] = [
    // Home link (always present)
    ...(matches(t('nav:home'))
      ? [
          {
            value: 'nav:home',
            label: t('nav:home'),
            icon: HomeIcon,
            run: () => {
              router.push('/admin');
            }
          }
        ]
      : []),
    // Collections the user can see
    ...visibleCollections()
      .map((col) => ({ col, label: collectionLabel(col.slug) }))
      .filter(({ label }) => matches(label))
      .map(({ col, label }) => ({
        value: `nav:${col.slug}`,
        label,
        icon: getSlugIcon(col.slug),
        run: () => {
          router.push(`/admin/collections/${col.slug}`);
        }
      }))
  ];

  // Workspace items (only if the user can switch tenants)
  const workspaceItems: PaletteCommandItem[] =
    tenantOptions.length > 1
      ? [
          ...tenantOptions
            .filter((option) => matches(String(option.label)))
            .map((option) => ({
              value: `tenant:${option.value}`,
              label: String(option.label),
              icon: BuildingOffice2Icon,
              checked: selectedTenantID === option.value,
              run: () => {
                setTenant({ id: option.value, refresh: true });
              }
            })),
          ...(matches(t('palette:workspaceAll'))
            ? [
                {
                  value: 'tenant:all',
                  label: t('palette:workspaceAll'),
                  icon: ArrowsRightLeftIcon,
                  checked: selectedTenantID === undefined,
                  run: () => {
                    setTenant({ id: undefined, refresh: true });
                  }
                }
              ]
            : [])
        ]
      : [];

  const hasStaticMatches =
    actionItems.length > 0 ||
    navigationItems.length > 0 ||
    workspaceItems.length > 0;

  return { actionItems, navigationItems, workspaceItems, hasStaticMatches };
}

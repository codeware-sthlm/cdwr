'use client';

import { getSlugIcon } from '@codeware/app-cms/ui/dashboard';
import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import { TenantIcon } from '@codeware/shared/ui/cms-renderer';
import { CdwrCloud } from '@codeware/shared/ui/primitives';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from '@codeware/shared/ui/shadcn/components/input-group';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  useSidebar
} from '@codeware/shared/ui/shadcn/components/sidebar';
import type {
  TenantIconConfig,
  User
} from '@codeware/shared/util/payload-types';
import {
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  ChevronDoubleLeftIcon,
  HomeIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client';
import { useAuth, useNav, useTranslation } from '@payloadcms/ui';
import { PaletteIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ClientCollectionConfig } from 'payload';
import React, { useEffect, useMemo, useState } from 'react';

import { FORCE_LOGOUT_PATH } from '../../utils/force-logout';

import { paletteShortcutLabel } from './palette/palette-shortcut-label';
import { usePalette } from './palette/PaletteProvider.client';
import { localize } from './utils/localize';
import { useVisibleCollections } from './utils/use-visible-collections';

// ── layout constants ──────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = 266;
const SIDEBAR_WIDTH_ICON = 74;

// ── sub-components ────────────────────────────────────────────────────────────

/** Brand-gradient circular initial, standing in for a shadcn Avatar (not yet
 * published for the `nova` registry style used by this workspace). */
function InitialAvatar({ initial }: { initial: string }) {
  return (
    <div className="from-brand-600 to-brand-400 flex size-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br text-xs font-semibold text-white">
      {initial}
    </div>
  );
}

/** Brand logo tile. */
function BrandTile() {
  return (
    <div className="shrink-0 p-1">
      <CdwrCloud size={24} />
    </div>
  );
}

/**
 * Square identity tile shown in the sidebar header.
 *
 * - selected tenant with an icon → its `iconSource` (SVG markup or image URL)
 * - selected tenant without an icon → its initial
 * - no tenant selected → the codeware cloud mark (`BrandTile`)
 */
function WorkspaceTile({
  iconConfig,
  name
}: {
  iconConfig: TenantIconConfig | null;
  name: string;
}) {
  // No tenant selected (a host system user or a multi-tenant editor who hasn't
  // picked one) → platform cloud mark, no wordmark.
  if (!name) {
    return <BrandTile />;
  }
  if (iconConfig) {
    return (
      <div className="border-border bg-background flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
        <TenantIcon config={iconConfig} size={20} />
      </div>
    );
  }
  return <InitialAvatar initial={name.charAt(0).toUpperCase()} />;
}

// ── nav content (needs the Sidebar context, so it lives inside the Provider) ──

function AdminNavContent({
  initialCounts,
  unreadCounts,
  tenantIcons,
  tenantSelector,
  mismatchNotice
}: {
  initialCounts: Record<string, number>;
  /** Per-slug counts of items needing attention, overriding `initialCounts` */
  unreadCounts: Record<string, number>;
  /** Server-resolved `tenantId → iconConfig` map (see `AdminNavWrapper`). */
  tenantIcons: Record<string, TenantIconConfig | null>;
  /** Server-rendered multi-tenant plugin selector (see `AdminNavWrapper`). */
  tenantSelector?: React.ReactNode;
  /** Server-rendered warning for a refused session (see `AdminNavWrapper`). */
  mismatchNotice?: React.ReactNode;
}) {
  const { user, logOut } = useAuth<User>();
  const { navOpen, setNavOpen } = useNav();
  const { openPalette } = usePalette();
  const pathname = usePathname();
  const { isMobile, state, toggleSidebar } = useSidebar();
  const { options: tenantOptions, selectedTenantID } = useTenantSelection();
  const { i18n, t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const visibleCollections = useVisibleCollections();

  const [filter, setFilter] = useState('');

  const language = i18n.language;
  const collapsed = state === 'collapsed';

  // Header reflects the selected workspace. Both the name and the icon come
  // from server-provided data (selector options + the `tenantIcons` map), so
  // switching workspaces is instant with no client fetch or avatar flash.
  const tenantName = useMemo(() => {
    if (selectedTenantID === undefined) {
      return '';
    }
    const option = tenantOptions.find(
      (o) => String(o.value) === String(selectedTenantID)
    );
    return option ? String(option.label) : '';
  }, [tenantOptions, selectedTenantID]);

  const tenantIcon =
    selectedTenantID === undefined
      ? null
      : (tenantIcons[String(selectedTenantID)] ?? null);

  // Our Sidebar renders as a `position: fixed` overlay, independent of
  // Payload's own Nav grid track (`.template-default`'s first grid column) —
  // the two don't know about each other by default, so Payload never reserves
  // room for it and main content renders underneath. Drive Payload's own
  // `navOpen` state and `--nav-width` var to keep its grid track in sync with
  // our actual rendered width, so main content shifts alongside expand/collapse.
  // On mobile our Sidebar is a temporary overlay Sheet instead — main content
  // shouldn't reserve space for it there, so let Payload's nav stay closed.
  useEffect(() => {
    if (isMobile) {
      if (navOpen) {
        setNavOpen(false);
      }
      return;
    }
    if (!navOpen) {
      setNavOpen(true);
    }
    document.documentElement.style.setProperty(
      '--nav-width',
      `${collapsed ? SIDEBAR_WIDTH_ICON : SIDEBAR_WIDTH}px`
    );
  }, [isMobile, navOpen, setNavOpen, collapsed]);

  // Group visible (non-auth) collections by admin.group, applying the
  // sidebar's filter box against the localized collection label.
  const grouped = React.useMemo(() => {
    const query = filter.trim().toLowerCase();
    const map = new Map<string, ClientCollectionConfig[]>();
    for (const col of visibleCollections({ exclude: ['users', 'tenants'] })) {
      const label = localize(col.labels.plural, language, col.slug);
      if (query && !label.toLowerCase().includes(query)) {
        continue;
      }
      const group = localize(col.admin.group, language);
      map.set(group, [...(map.get(group) ?? []), col]);
    }
    return map;
  }, [language, filter, visibleCollections]);

  const isSystemUser = user?.role === 'system-user';

  // Filtered against their own labels, the way the collection groups are — a
  // filter box that silently ignores half the menu is worse than none
  const platformLinks = React.useMemo(() => {
    const query = filter.trim().toLowerCase();

    return [
      {
        href: '/admin/theme-library',
        label: t('nav:themeLibrary'),
        Icon: PaletteIcon
      }
    ].filter(({ label }) => !query || label.toLowerCase().includes(query));
  }, [filter, t]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  const userInitial =
    user?.name?.charAt(0)?.toUpperCase() ??
    user?.email?.charAt(0)?.toUpperCase() ??
    '?';
  const userName = user?.name ?? user?.email ?? '';
  const userRole =
    user?.role === 'system-user'
      ? t('nav:roleSystemAdmin')
      : t('nav:roleEditor');

  const filtering = filter.trim().length > 0;

  return (
    <>
      {/* Payload's own toolbar (`.app-header`) sits at `--z-modal` (30) and
       * would otherwise paint over — and intercept clicks on — the sidebar's
       * `fixed` container (z-10 by default), so it needs to sit above that. */}
      {/* On mobile the Sidebar renders as a Sheet portaled to document.body,
       * which escapes the `codeware-admin twp` scope on the provider — the
       * scope has to travel with it or the mobile nav renders untokenized. */}
      {/* `z-40` is desktop-only on purpose: on mobile this className lands on
       * the Sheet, whose overlay is `z-50` — a lower z would park the nav
       * behind the overlay's blur. The Sheet's own z-50 is already correct. */}
      <Sidebar
        collapsible="icon"
        className="codeware-admin twp border-border md:z-40"
      >
        {/* ── Header: brand row, workspace switcher, filter ── */}
        <SidebarHeader className="gap-4 p-3.5">
          {/* Only rendered when this host is one the deployment refuses
           * cookies from — the state where the rest of the nav quietly
           * degrades to what an unauthenticated visitor would see. */}
          {mismatchNotice}

          {/* Expanded: selected-workspace identity + subtle collapse toggle.
           * Collapsed rail: only the identity tile, clicking it expands. */}
          <div className="flex items-center justify-between group-data-[collapsible=icon]:justify-center">
            <div className="flex min-w-0 items-center gap-2 group-data-[collapsible=icon]:hidden">
              <WorkspaceTile iconConfig={tenantIcon} name={tenantName} />
              {tenantName && (
                <span className="text-foreground truncate text-sm font-medium">
                  {tenantName}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={toggleSidebar}
              title={t('nav:expandSidebar')}
              className="focus-visible:ring-ring hidden cursor-pointer rounded-lg group-data-[collapsible=icon]:block focus-visible:ring-2 focus-visible:outline-none"
            >
              <WorkspaceTile iconConfig={tenantIcon} name={tenantName} />
            </button>
            <Button
              onClick={toggleSidebar}
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground shrink-0 group-data-[collapsible=icon]:hidden"
              title={t('nav:collapseSidebar')}
            >
              <ChevronDoubleLeftIcon className="size-4" />
            </Button>
          </div>

          {/* Payload's own multi-tenant plugin control, server-rendered by
           * `AdminNavWrapper` (its /rsc export is server-only) and passed in
           * as a slot. It owns the real tenant list/switch/access logic and
           * hides itself when the user only has access to a single tenant. */}
          {tenantSelector && (
            <div className="group-data-[collapsible=icon]:hidden">
              {tenantSelector}
            </div>
          )}

          <InputGroup className="border-border bg-background h-9 group-data-[collapsible=icon]:hidden">
            <InputGroupAddon>
              <MagnifyingGlassIcon className="text-muted-foreground size-4" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder={t('nav:searchPlaceholder')}
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <button
                type="button"
                onClick={openPalette}
                title={t('palette:openPalette')}
                className="border-border bg-muted text-muted-foreground hover:text-foreground focus-visible:ring-ring cursor-pointer rounded border px-1 py-px font-sans text-[10px] focus-visible:ring-2 focus-visible:outline-none"
              >
                {paletteShortcutLabel()}
              </button>
            </InputGroupAddon>
          </InputGroup>
        </SidebarHeader>

        {/* ── Content: Home, collection groups ── */}
        <SidebarContent className="gap-4 px-3.5">
          {!filtering && (
            <SidebarGroup className="p-0">
              <SidebarGroupContent>
                <SidebarMenu className="group-data-[collapsible=icon]:items-center">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === '/admin'}
                      tooltip={t('nav:home')}
                    >
                      <Link href="/admin">
                        <HomeIcon className="size-4" />
                        <span>{t('nav:home')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {filtering &&
            grouped.size === 0 &&
            !(isSystemUser && platformLinks.length > 0) && (
              <p className="text-muted-foreground px-2 py-1 text-xs">
                {t('nav:noMatches')}
              </p>
            )}

          {[...grouped.entries()].map(([groupName, collections]) => (
            <SidebarGroup key={groupName} className="p-0">
              <SidebarGroupLabel className="font-semibold tracking-widest uppercase">
                {groupName}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="group-data-[collapsible=icon]:items-center">
                  {collections.map((col) => {
                    const Icon = getSlugIcon(col.slug);
                    const href = `/admin/collections/${col.slug}`;
                    const label = localize(
                      col.labels.plural,
                      language,
                      col.slug
                    );
                    // Collections with an unread notion badge what needs
                    // attention and drop the badge once nothing does; the rest
                    // keep showing how many documents they hold
                    const unread = unreadCounts[col.slug];
                    const count =
                      unread === undefined
                        ? initialCounts[col.slug]
                        : unread || undefined;
                    return (
                      <SidebarMenuItem key={col.slug}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive(href)}
                          tooltip={label}
                        >
                          <Link href={href}>
                            <Icon className="size-4" />
                            <span>{label}</span>
                          </Link>
                        </SidebarMenuButton>
                        {count !== undefined && (
                          <SidebarMenuBadge>{count}</SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}

          {/* ── Platform: routes of their own, not collections ──

              The groups above are built from collections, so a view mounted on
              its own path has nowhere to appear and can only be reached by
              typing the URL. Gated the same way the view itself is: a tenant
              admin editing a platform theme would change every tenant's site. */}
          {isSystemUser && platformLinks.length > 0 && (
            <SidebarGroup className="p-0">
              <SidebarGroupLabel className="font-semibold tracking-widest uppercase">
                {t('nav:platformGroup')}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="group-data-[collapsible=icon]:items-center">
                  {platformLinks.map(({ href, label, Icon }) => (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(href)}
                        tooltip={label}
                      >
                        <Link href={href}>
                          <Icon className="size-4" />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        {/* ── Footer: current user + logout ── */}
        <SidebarFooter className="gap-3 p-3.5">
          <SidebarSeparator className="mx-0" />
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
            {/* The same button every nav item uses, so the account page
                highlights when it is the one you are on. Hand-rolled, it
                answered on hover and never on active. */}
            <SidebarMenuButton
              asChild
              size="lg"
              isActive={isActive('/admin/account')}
              tooltip={t('nav:accountSettings')}
              className="min-w-0 flex-1 group-data-[collapsible=icon]:flex-none"
            >
              <Link href="/admin/account">
                <InitialAvatar initial={userInitial} />
                <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <p className="truncate text-xs font-medium">{userName}</p>
                  <p className="text-muted-foreground text-xs">{userRole}</p>
                </div>
              </Link>
            </SidebarMenuButton>
            <Button
              onClick={async () => {
                // Payload's logOut skips the request entirely when the client
                // has no user and swallows failures otherwise, so it cannot be
                // relied on to clear the cookie. Let it do its bookkeeping,
                // then leave through the route that always does — in a finally,
                // so the way out does not depend on how logOut ended.
                try {
                  await logOut();
                } finally {
                  window.location.href = FORCE_LOGOUT_PATH;
                }
              }}
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground ml-auto shrink-0 group-data-[collapsible=icon]:hidden"
              title={t('nav:logOut')}
            >
              <ArrowLeftOnRectangleIcon className="size-4" />
            </Button>
          </div>
        </SidebarFooter>

        {/* Clickable sidebar edge — the standard shadcn toggle affordance,
         * works in both expanded and collapsed states (⌘B works too). */}
        <SidebarRail
          title={collapsed ? t('nav:expandSidebar') : t('nav:collapseSidebar')}
          aria-label={
            collapsed ? t('nav:expandSidebar') : t('nav:collapseSidebar')
          }
        />
      </Sidebar>

      {/* On mobile the Sidebar renders as a closed-by-default Sheet, so the
       * toggle button inside SidebarHeader is unreachable until it's open —
       * this external trigger is the only way to open it in the first place.
       *
       * The wrapper does the centering: it spans Payload's toolbar height and
       * centers with flex, matching the actions as the header height changes
       * across breakpoints. Centering the Button itself with `-translate-y-1/2`
       * would be clobbered on press by its own `active:translate-y-px`, which
       * rewrites the same `--tw-translate-y` and drops the button half its
       * height (animated, since the Button also sets `transition-all`). */}
      <div className="fixed top-0 left-(--gutter-h) z-50 flex h-[var(--app-header-height)] items-center md:hidden">
        <Button
          onClick={toggleSidebar}
          variant="outline"
          size="icon"
          title={t('nav:openSidebar')}
        >
          <Bars3Icon className="size-4" />
        </Button>
      </div>
    </>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export const AdminNav: React.FC<{
  initialCounts?: Record<string, number>;
  unreadCounts?: Record<string, number>;
  /** Server-resolved `tenantId → iconConfig` map (see `AdminNavWrapper`). */
  tenantIcons?: Record<string, TenantIconConfig | null>;
  sidebarOpen?: boolean;
  /** Server-rendered multi-tenant plugin selector (see `AdminNavWrapper`). */
  tenantSelector?: React.ReactNode;
  /** Server-rendered warning for a refused session (see `AdminNavWrapper`). */
  mismatchNotice?: React.ReactNode;
}> = ({
  initialCounts = {},
  unreadCounts = {},
  tenantIcons = {},
  sidebarOpen = true,
  tenantSelector,
  mismatchNotice
}) => {
  return (
    <SidebarProvider
      defaultOpen={sidebarOpen}
      className="codeware-admin twp h-full min-h-0 w-auto"
      style={
        {
          // Payload sets `html { font-size: 13px }`, which would otherwise
          // shrink the component's default rem-based sidebar widths.
          '--sidebar-width': `${SIDEBAR_WIDTH}px`,
          '--sidebar-width-icon': `${SIDEBAR_WIDTH_ICON}px`
        } as React.CSSProperties
      }
    >
      <AdminNavContent
        initialCounts={initialCounts}
        unreadCounts={unreadCounts}
        tenantIcons={tenantIcons}
        tenantSelector={tenantSelector}
        mismatchNotice={mismatchNotice}
      />
    </SidebarProvider>
  );
};

export default AdminNav;

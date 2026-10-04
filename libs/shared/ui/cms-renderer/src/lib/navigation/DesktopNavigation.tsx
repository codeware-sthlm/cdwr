'use client';

import { buttonVariants } from '@codeware/shared/ui/shadcn/components/button';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger
} from '@codeware/shared/ui/shadcn/components/navigation-menu';
import { t } from '@codeware/shared/util/i18n';
import type {
  NavigationAppearance,
  NavigationGroup,
  NavigationItem
} from '@codeware/shared/util/payload-api';
import { cn } from '@codeware/shared/util/ui';
import { forwardRef } from 'react';

import { usePayload } from '../providers/PayloadProvider';
import { navChrome } from '../theme/chrome';
import { isActivePath, isExactPath } from '../utils/active-path';
import { handleAsRoute } from '../utils/internal-link';

/** Activates a link as a route change, unless the click opens elsewhere. */
function useRouteLink(href: string) {
  const { getCurrentPath, navigate } = usePayload();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!handleAsRoute(e)) return;
    navigate(href);
  };

  const path = getCurrentPath();
  const isActive = isActivePath(path, href);
  // Radix says `page` for an active link; a parent of the page is current
  // in a looser sense, and a screen reader should not hear it is the page
  const ariaCurrent: 'page' | 'true' | undefined = isActive
    ? isExactPath(path, href)
      ? 'page'
      : 'true'
    : undefined;

  return { handleClick, isActive, ariaCurrent };
}

function NavItem({
  appearance,
  href,
  children
}: {
  appearance: NavigationAppearance;
  href: string;
  children: React.ReactNode;
}) {
  const { handleClick, isActive, ariaCurrent } = useRouteLink(href);

  // The same button as a hero's call to action, so the one action a site
  // asks for looks the same wherever it is offered. It stays put when active:
  // the underline marks where you are, and a button is where to go
  if (appearance === 'button') {
    return (
      <NavigationMenuItem className="content-center pl-2">
        {/* A menu link still, so the arrow keys reach it and an open group
            closes when it is chosen; dressed as the button, whose classes
            come last and win */}
        <NavigationMenuLink
          href={href}
          onClick={handleClick}
          className={cn(
            buttonVariants({ size: 'sm' }),
            // The link base keeps a muted focus fill and its own padding;
            // only clashing utilities give way, so these are said again
            'focus:bg-primary focus:text-primary-foreground py-0'
          )}
        >
          {children}
        </NavigationMenuLink>
      </NavigationMenuItem>
    );
  }

  return (
    <NavigationMenuItem className="content-center">
      <NavigationMenuLink
        asChild
        active={isActive}
        aria-current={ariaCurrent}
        className={cn(
          'relative block min-w-max bg-transparent px-3 py-2 transition hover:bg-transparent focus:bg-transparent data-active:bg-transparent data-active:hover:bg-transparent data-active:focus:bg-transparent',
          isActive
            ? 'text-core-nav-link-active'
            : 'text-core-nav-link hover:text-core-nav-link-hover'
        )}
      >
        <a href={href} onClick={handleClick}>
          {children}
          {/* Add a gradient brand line to the active link for a visual effect */}
          {isActive && (
            <span className="from-core-nav-link-active/0 via-core-nav-link-active/40 to-core-nav-link-active/0 absolute inset-x-1 -bottom-0.5 h-px bg-linear-to-r" />
          )}
        </a>
      </NavigationMenuLink>
    </NavigationMenuItem>
  );
}

/**
 * A link inside a group's panel.
 *
 * Flat chrome keeps the component's own look, so the panel reads as the kit's
 * popover; outlined chrome dresses it in the bar's tokens, to match the pill.
 */
function GroupChild({
  href,
  children
}: {
  href: string;
  children: React.ReactNode;
}) {
  const { chrome } = usePayload();
  const { handleClick, isActive, ariaCurrent } = useRouteLink(href);

  return (
    <li>
      <NavigationMenuLink
        asChild
        active={isActive}
        aria-current={ariaCurrent}
        className={cn(
          chrome === 'outlined' && [
            'block rounded-md px-3 py-2 text-sm font-normal',
            'hover:bg-core-action-btn-track focus:bg-core-action-btn-track data-active:bg-transparent',
            isActive
              ? 'text-core-nav-link-active'
              : 'text-core-nav-link hover:text-core-nav-link-hover'
          ]
        )}
      >
        <a href={href} onClick={handleClick}>
          {children}
        </a>
      </NavigationMenuLink>
    </li>
  );
}

/** A label that opens a panel of links, marked active while one of them is. */
function NavGroup({ group }: { group: NavigationGroup }) {
  const { chrome, getCurrentPath } = usePayload();

  const isActive = group.children.some(({ url }) =>
    isActivePath(getCurrentPath(), url)
  );

  return (
    <NavigationMenuItem className="content-center">
      <NavigationMenuTrigger
        className={cn(
          chrome === 'outlined' &&
            'h-auto bg-transparent px-3 py-2 hover:bg-transparent focus:bg-transparent data-open:bg-transparent data-open:hover:bg-transparent data-open:focus:bg-transparent data-popup-open:bg-transparent data-popup-open:hover:bg-transparent',
          isActive
            ? 'text-core-nav-link-active'
            : chrome === 'outlined' &&
                'text-core-nav-link hover:text-core-nav-link-hover data-open:text-core-nav-link-hover'
        )}
      >
        {group.label}
      </NavigationMenuTrigger>
      <NavigationMenuContent
        className={cn(
          'min-w-48',
          chrome === 'outlined' &&
            'group-data-[viewport=false]/navigation-menu:bg-core-background-content group-data-[viewport=false]/navigation-menu:ring-core-navbar-border p-2 group-data-[viewport=false]/navigation-menu:mt-2 group-data-[viewport=false]/navigation-menu:rounded-xl group-data-[viewport=false]/navigation-menu:shadow-lg'
        )}
      >
        <ul>
          {group.children.map(({ key, label, url }) => (
            <GroupChild key={key} href={url}>
              {label}
            </GroupChild>
          ))}
        </ul>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
}

export const DesktopNavigation = forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<typeof NavigationMenu> & {
    navigationTree: NavigationItem[];
  }
>(function DesktopNavigation({ navigationTree, ...props }, ref) {
  const { chrome, locale } = usePayload();

  if (navigationTree.length === 0) {
    return null;
  }

  return (
    // Named because the footer carries a navigation landmark too, and two
    // unnamed ones are indistinguishable to a screen reader. Each group's panel
    // opens under its own trigger, so there is no shared viewport
    <NavigationMenu
      ref={ref}
      viewport={false}
      aria-label={t(locale, 'navigation.primary')}
      {...props}
    >
      <NavigationMenuList className={navChrome({ chrome })}>
        {navigationTree.map((item) =>
          item.kind === 'group' ? (
            <NavGroup key={item.key} group={item} />
          ) : (
            <NavItem
              key={item.key}
              appearance={item.appearance}
              href={item.url}
            >
              {item.label}
            </NavItem>
          )
        )}
      </NavigationMenuList>
    </NavigationMenu>
  );
});

'use client';

import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { t } from '@codeware/shared/util/i18n';
import type {
  NavigationAppearance,
  NavigationItem
} from '@codeware/shared/util/payload-api';
import { cn } from '@codeware/shared/util/ui';
import { forwardRef } from 'react';

import { usePayload } from '../providers/PayloadProvider';
import { navChrome } from '../theme/chrome';
import { isActivePath } from '../utils/active-path';
import { handleAsRoute } from '../utils/internal-link';

function NavItem({
  appearance,
  href,
  children
}: {
  appearance: NavigationAppearance;
  href: string;
  children: React.ReactNode;
}) {
  const { getCurrentPath, navigate } = usePayload();

  const isActive = isActivePath(getCurrentPath(), href);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!handleAsRoute(e)) return;
    navigate(href);
  };

  // The same button as a hero's call to action, so the one action a site
  // asks for looks the same wherever it is offered. It stays put when active:
  // the underline marks where you are, and a button is where to go
  if (appearance === 'button') {
    return (
      <li className="content-center pl-2">
        <Button asChild size="sm">
          <a href={href} onClick={handleClick}>
            {children}
          </a>
        </Button>
      </li>
    );
  }

  return (
    <li className="content-center">
      <a
        href={href}
        onClick={handleClick}
        className={cn(
          'relative block min-w-max px-3 py-2 transition',
          isActive
            ? 'text-core-nav-link-active'
            : 'text-core-nav-link hover:text-core-nav-link-hover'
        )}
      >
        {children}
        {/* Add a gradient brand line to the active link for a visual effect */}
        {isActive && (
          <span className="from-core-nav-link-active/0 via-core-nav-link-active/40 to-core-nav-link-active/0 absolute inset-x-1 -bottom-0.5 h-px bg-linear-to-r" />
        )}
      </a>
    </li>
  );
}

export const DesktopNavigation = forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<'nav'> & {
    navigationTree: NavigationItem[];
  }
>(function DesktopNavigation({ navigationTree, ...props }, ref) {
  const { chrome, locale } = usePayload();

  if (navigationTree.length === 0) {
    return null;
  }

  return (
    // Named because the footer carries a navigation landmark too, and two
    // unnamed ones are indistinguishable to a screen reader
    <nav ref={ref} aria-label={t(locale, 'navigation.primary')} {...props}>
      <ul className={navChrome({ chrome })}>
        {navigationTree.map(({ appearance, key, label, url }) => (
          <NavItem key={key} appearance={appearance} href={url}>
            {label}
          </NavItem>
        ))}
      </ul>
    </nav>
  );
});

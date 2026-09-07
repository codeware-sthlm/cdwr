'use client';

import { t } from '@codeware/shared/util/i18n';
import type { NavigationItem } from '@codeware/shared/util/payload-api';
import {
  Popover,
  PopoverBackdrop,
  PopoverButton,
  PopoverPanel
} from '@headlessui/react';
import { ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/outline';

import { usePayload } from '../providers/PayloadProvider';
import { mobileNavChrome } from '../theme/chrome';
import { isActivePath } from '../utils/active-path';
import { handleAsRoute } from '../utils/internal-link';

export function MobileNavigation({
  navigationTree,
  ...props
}: React.ComponentPropsWithoutRef<typeof Popover> & {
  navigationTree: NavigationItem[];
}) {
  const { chrome, getCurrentPath, navigate, locale } = usePayload();
  const pathname = getCurrentPath();

  if (navigationTree.length === 0) {
    return null;
  }

  return (
    <Popover {...props}>
      <PopoverButton className={mobileNavChrome({ chrome })}>
        {t(locale, 'navigation.menu')}
        <ChevronDownIcon className="stroke-core-nav-link/80 group-hover:stroke-core-nav-link ml-2 size-3" />
      </PopoverButton>
      <PopoverBackdrop
        transition
        className="bg-core-background-body/60 fixed inset-0 z-50 backdrop-blur-sm duration-150 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in"
      />
      <PopoverPanel
        focus
        transition
        className="bg-core-background-content ring-core-action-btn-border-hover fixed inset-x-4 top-8 z-50 origin-top rounded-3xl p-8 ring-1 duration-150 data-closed:scale-95 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in"
      >
        {/* `close` comes from the panel rather than wrapping each link in a
            `PopoverButton`: our handler calls `preventDefault`, which would
            stop Headless UI's own close handler from running */}
        {({ close }) => (
          <>
            <div className="flex flex-row-reverse items-center justify-between">
              <PopoverButton aria-label="Close menu" className="-m-1 p-1">
                <XMarkIcon className="size-6 hover:cursor-pointer" />
              </PopoverButton>
              <h2 className="text-sm font-medium">
                {t(locale, 'navigation.title')}
              </h2>
            </div>
            <nav className="mt-6">
              <ul className="text-core-nav-link -my-2">
                {navigationTree.map(({ key, label, url }) => {
                  const isActive = isActivePath(pathname, url);

                  const handleClick = (
                    e: React.MouseEvent<HTMLAnchorElement>
                  ) => {
                    // A modified click opens elsewhere, so the menu stays put
                    if (!handleAsRoute(e)) return;
                    close();
                    navigate(url);
                  };

                  return (
                    <li key={key}>
                      <a
                        href={url}
                        onClick={handleClick}
                        className={
                          isActive
                            ? 'text-core-nav-link-active hover:text-core-nav-link-hover block py-2'
                            : 'hover:text-core-nav-link-hover block py-2'
                        }
                      >
                        {label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </>
        )}
      </PopoverPanel>
    </Popover>
  );
}

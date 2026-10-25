'use client';

import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client';
import { useRouter } from 'next/navigation';
import React from 'react';

type Props = {
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
  href: string;
  tenantId: number | string;
};

/**
 * A link to a list filtered on a workspace. The list also keeps to the
 * workspace picked in the selector, so following the link selects this one
 * first; otherwise the list could come up empty next to a count that says
 * otherwise. The selection is a cookie, so a new tab gets it too.
 */
export const WorkspaceListLink: React.FC<Props> = ({
  ariaLabel,
  children,
  className,
  href,
  tenantId
}) => {
  const router = useRouter();
  const { setTenant } = useTenantSelection();

  const select = () => setTenant({ id: tenantId, refresh: false });

  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    select();
    // New-tab and other modified clicks stay with the browser
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    router.push(href);
  };

  return (
    <a
      href={href}
      className={className}
      aria-label={ariaLabel}
      onClick={onClick}
      // Middle-click and "Open in new tab" never reach onClick
      onAuxClick={select}
      onContextMenu={select}
    >
      {children}
    </a>
  );
};

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
 * workspace picked in the selector, so a plain click selects this one first;
 * otherwise the list could come up empty next to a count that says otherwise.
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

  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // Leave new-tab and other modified clicks to the browser
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
    setTenant({ id: tenantId, refresh: false });
    router.push(href);
  };

  return (
    <a
      href={href}
      className={className}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </a>
  );
};

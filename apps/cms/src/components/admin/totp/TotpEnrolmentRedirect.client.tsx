'use client';

import { useAuth } from '@payloadcms/ui';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

type TotpUser = {
  _strategy?: string;
  hasTotp?: boolean;
  totpRequired?: boolean;
};

/**
 * The client half of the setup redirect: signing in navigates on the client,
 * so the server provider does not render again for the new user.
 */
export function TotpEnrolmentRedirectClient({
  children,
  setupUrl
}: {
  children?: ReactNode;
  setupUrl: string;
}) {
  const { user } = useAuth<TotpUser>();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const strategy = user?._strategy;
    if (
      user?.totpRequired &&
      !user.hasTotp &&
      strategy &&
      strategy !== 'totp' &&
      strategy !== 'api-key' &&
      pathname.replace(/\/$/, '') !== setupUrl
    ) {
      router.push(`${setupUrl}?back=${encodeURIComponent(pathname)}`);
    }
  }, [user, pathname, router, setupUrl]);

  return children;
}

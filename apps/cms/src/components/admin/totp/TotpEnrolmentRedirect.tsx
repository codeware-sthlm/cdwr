import { isTotpSetupPending } from '@codeware/app-cms/util/access';
import type { UserAny } from '@codeware/shared/util/payload-types';
import { formatAdminURL } from '@payloadcms/ui/shared';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Payload } from 'payload';
import type { ReactNode } from 'react';

import { TotpEnrolmentRedirectClient } from './TotpEnrolmentRedirect.client';

type Props = {
  children?: ReactNode;
  payload: Payload;
  user?: UserAny | null;
};

/**
 * Sends a user who must enrol in TOTP to the setup view, on the server for a
 * full page load and on the client after signing in.
 */
export async function TotpEnrolmentRedirect({
  children,
  payload,
  user
}: Props) {
  const setupUrl = formatAdminURL({
    adminRoute: payload.config.routes.admin,
    path: '/setup-totp'
  });
  const pathname = (await headers()).get('x-pathname') ?? '/';

  if (isTotpSetupPending(user) && pathname.replace(/\/$/, '') !== setupUrl) {
    redirect(`${setupUrl}?back=${encodeURIComponent(pathname)}`);
  }

  return (
    <TotpEnrolmentRedirectClient setupUrl={setupUrl}>
      {children}
    </TotpEnrolmentRedirectClient>
  );
}

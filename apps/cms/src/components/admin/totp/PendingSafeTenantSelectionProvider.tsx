import { isSecondFactorPending } from '@codeware/app-cms/util/access';
import type { UserAny } from '@codeware/shared/util/payload-types';
import { TenantSelectionProvider } from '@payloadcms/plugin-multi-tenant/rsc';
import type { TypedUser } from 'payload';
import type { ComponentProps } from 'react';

type Props = Omit<ComponentProps<typeof TenantSelectionProvider>, 'user'> & {
  user?: UserAny | null;
};

/**
 * The multi-tenant plugin's provider, which reads the user's tenants as the
 * user on every admin page. A session that still owes its second factor is
 * refused that read, and the provider renders outside the redirects that
 * would send it on, so it gets no user and no tenant options instead.
 */
export async function PendingSafeTenantSelectionProvider({
  user,
  ...props
}: Props) {
  const visibleUser = isSecondFactorPending(user) ? null : user;

  // Without a user the plugin reads no tenants; its type doesn't allow for one
  return <TenantSelectionProvider {...props} user={visibleUser as TypedUser} />;
}

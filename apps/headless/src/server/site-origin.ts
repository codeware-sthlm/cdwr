import {
  adoptableDomains,
  siteOrigin
} from '@codeware/shared/util/payload-utils';
import { getRequestHeader } from '@tanstack/react-start/server';

/**
 * The address the site calls its own, for links a crawler follows.
 *
 * The workspace's primary domain once adopted, so a page names one host
 * whichever one the visitor came in on; otherwise the host this request
 * reached. Server only: it reads the request.
 *
 * @param domains - The tenant's domain rows
 * @param flyAppName - This deployment's Fly app name
 * @returns The origin without a trailing slash, or `null` when none is known
 */
export function resolveSiteOrigin(
  domains: Parameters<typeof adoptableDomains>[0],
  flyAppName: string | undefined
): string | null {
  const { primary } = adoptableDomains(domains, flyAppName);
  if (primary) {
    return new URL(primary).origin;
  }

  return (
    siteOrigin(
      getRequestHeader('host') ?? null,
      getRequestHeader('x-forwarded-proto') ?? null
    )?.origin ?? null
  );
}

import {
  adoptableDomains,
  siteOrigin
} from '@codeware/shared/util/payload-utils';

/**
 * The address the site calls its own, for links a crawler follows.
 *
 * The workspace's primary domain once adopted, so a page names one host
 * whichever one the visitor came in on; otherwise the host this request
 * reached.
 *
 * @param domains - The tenant's domain rows
 * @param flyAppName - This deployment's Fly app name
 * @param host - The request's `host` header, when it has one
 * @param proto - The request's `x-forwarded-proto` header, when it has one
 * @returns The origin without a trailing slash, or `null` when none is known
 */
export function resolveSiteOrigin(
  domains: Parameters<typeof adoptableDomains>[0],
  flyAppName: string | undefined,
  host: string | null,
  proto: string | null
): string | null {
  const { primary } = adoptableDomains(domains, flyAppName);
  if (primary) {
    return new URL(primary).origin;
  }

  return siteOrigin(host, proto)?.origin ?? null;
}

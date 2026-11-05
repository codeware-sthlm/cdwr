import { resolveSiteOrigin as resolveOrigin } from '@codeware/app-headless/util/seo';
import type { adoptableDomains } from '@codeware/shared/util/payload-utils';
import { getRequestHeader } from '@tanstack/react-start/server';

/**
 * The address the site calls its own, for links a crawler follows.
 * Server only: it reads the request.
 *
 * @param domains - The tenant's domain rows
 * @param flyAppName - This deployment's Fly app name
 * @returns The origin without a trailing slash, or `null` when none is known
 */
export function resolveSiteOrigin(
  domains: Parameters<typeof adoptableDomains>[0],
  flyAppName: string | undefined
): string | null {
  return resolveOrigin(
    domains,
    flyAppName,
    getRequestHeader('host') ?? null,
    getRequestHeader('x-forwarded-proto') ?? null
  );
}

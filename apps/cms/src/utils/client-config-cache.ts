/**
 * Payload's per-language cache of the config the admin sends to the browser.
 *
 * `getClientConfig` (`@payloadcms/ui`) builds the client config once per
 * language and process, and keeps it on `global._payload_clientConfigs`. Each
 * entry carries the `serverURL` it was built with, so an entry built before
 * domain adoption keeps the Fly url for as long as the process runs: the
 * browser then sends that language's API requests cross-site, without the
 * session cookie, and gets 403.
 */
type ClientConfigCache = Record<string, { serverURL?: string } | undefined>;

const clientConfigCache = (): ClientConfigCache | undefined =>
  (globalThis as { _payload_clientConfigs?: ClientConfigCache })
    ._payload_clientConfigs;

/**
 * Drop every cached client config built with another `serverURL` than the
 * live one, so the next render of that language builds it again.
 *
 * Deletes in place on purpose: `getClientConfig` holds its own reference to
 * the cache object from when its module loaded, so replacing the global would
 * leave the stale entries where Payload reads them.
 *
 * @returns The languages dropped
 */
export const dropStaleClientConfigs = (
  serverURL: string | undefined
): string[] => {
  const cache = clientConfigCache();
  if (!cache) {
    return [];
  }

  const dropped: string[] = [];
  for (const [language, clientConfig] of Object.entries(cache)) {
    if (clientConfig?.serverURL !== serverURL) {
      delete cache[language];
      dropped.push(language);
    }
  }
  return dropped;
};

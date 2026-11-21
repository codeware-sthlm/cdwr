/** The parts of a workspace domain row that adoption reads */
export type AdoptableDomain = {
  hostname?: string | null;
  app?: string | null;
  isPrimary?: boolean | null;
  certificate?: { isConfigured?: boolean | null } | null;
};

export type AdoptableDomains = {
  /** The url the app should call its own, or `null` to keep what it has */
  primary: string | null;
  /** Every url the app answers on, primary first */
  origins: Array<string>;
};

/**
 * Which of a workspace's domains this deployment may actually serve.
 *
 * Two filters, both load-bearing:
 *
 * - **This app only.** One workspace can have domains on its web client and on
 *   its cms. Adopting another app's domain would make this one advertise a url
 *   it does not answer.
 * - **Issued certificates only.** A domain is added long before it works — that
 *   is the whole point of the dns instructions. Adopting one before its
 *   certificate exists would move every generated link and every password-reset
 *   email onto a hostname that fails TLS.
 *
 * `isPrimary` decides which url the app calls its own; the rest are still
 * answered, because a domain someone was moved off should keep working.
 *
 * @param domains - The workspace's domain rows
 * @param app - This deployment's Fly app name
 */
export const adoptableDomains = (
  domains: Array<AdoptableDomain> | null | undefined,
  app: string | null | undefined
): AdoptableDomains => {
  if (!app) {
    return { primary: null, origins: [] };
  }

  const usable = (domains ?? []).filter(
    (domain) =>
      domain.hostname && domain.app === app && domain.certificate?.isConfigured
  );

  // A stable order regardless of row order, so the primary is never decided by
  // where someone happened to drop it in the array
  const ordered = [
    ...usable.filter((domain) => domain.isPrimary),
    ...usable.filter((domain) => !domain.isPrimary)
  ];

  const origins = ordered.map((domain) => `https://${domain.hostname}`);

  return {
    // Only a domain explicitly marked primary takes over the app's identity.
    // Adopting whichever happened to validate first would move an app's url
    // out from under it as a side effect of adding a second domain.
    primary: ordered[0] && ordered[0].isPrimary ? origins[0] : null,
    origins
  };
};

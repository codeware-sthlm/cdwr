export type TotpUser = {
  _strategy?: string;
  hasTotp?: boolean;
  totpRequired?: boolean;
};

/**
 * Whether the signed-in user must be sent to the authenticator setup view.
 *
 * A `totp` session without a secret still counts: its cookie outlives a reset,
 * and the server refuses that session until the user enrols again.
 */
export const needsEnrolmentRedirect = (
  user: TotpUser | null | undefined,
  pathname: string,
  setupUrl: string
): boolean =>
  Boolean(
    user?.totpRequired &&
    !user.hasTotp &&
    user._strategy &&
    user._strategy !== 'api-key' &&
    pathname.replace(/\/$/, '') !== setupUrl
  );

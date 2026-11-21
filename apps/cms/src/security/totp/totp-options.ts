import type { payloadTotp } from 'payload-totp';

export type TotpPluginOptions = Parameters<typeof payloadTotp>[0];

/**
 * The issuer when no single tenant names the entry: the platform's name.
 * Codeware is a tenant of its own, so it is not this name.
 */
export const PLATFORM_TOTP_ISSUER = 'cdwr';

/**
 * The options `payloadTotp` runs with. Our setup view renders the plugin's
 * own with these, its issuer replaced per request, so the QR code and the
 * endpoints that check its codes never disagree on digits or period.
 */
export const totpOptions = {
  collection: 'users',
  forceSetup: false,
  totp: { issuer: PLATFORM_TOTP_ISSUER }
} satisfies TotpPluginOptions;

import type { AdminViewServerProps } from 'payload';
import { TOTPSetup } from 'payload-totp/rsc';
import React from 'react';

import { resolveTotpIssuer } from '../../../security/totp/totp-issuer';
import {
  type TotpPluginOptions,
  totpOptions
} from '../../../security/totp/totp-options';

// The plugin types its view's props with field props it never reads; Payload
// renders it, as it renders ours, with the view's props
const Setup = TOTPSetup as unknown as React.FC<
  AdminViewServerProps & { pluginOptions: TotpPluginOptions }
>;

/**
 * `payload-totp`'s setup view, with the authenticator entry named after the
 * user's only tenant, and its icon where the app serves that tenant's site.
 * Anyone else gets the platform's name. The plugin
 * reads one issuer for every request; this view works it out per request and
 * hands the plugin's own view its options with that issuer, so the form, the
 * secret and the endpoint stay the plugin's.
 */
export const TotpSetupView: React.FC<AdminViewServerProps> = async (props) => {
  const { req } = props.initPageResult;

  // Signed out or already enrolled, the plugin's view redirects at once
  if (!req.user || (req.user as { hasTotp?: boolean }).hasTotp) {
    return <Setup {...props} pluginOptions={totpOptions} />;
  }

  const { issuer, image } = await resolveTotpIssuer(req);

  return (
    <Setup
      {...props}
      pluginOptions={{
        ...totpOptions,
        // `image` comes from our patch of payload-totp
        totp: { ...totpOptions.totp, issuer, image }
      }}
    />
  );
};

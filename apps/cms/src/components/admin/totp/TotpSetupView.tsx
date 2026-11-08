import type { AdminViewServerProps } from 'payload';
import { TOTPSetup } from 'payload-totp/rsc';
import React from 'react';

import { resolveTotpIssuer } from '../../../security/totp/totp-issuer';
import { totpOptions } from '../../../security/totp/totp-options';

/**
 * `payload-totp`'s setup view, with the authenticator entry named after the
 * tenant. The plugin reads one issuer for every request; this view works it
 * out per request and hands the plugin's own view its options with that
 * issuer, so the form, the secret and the endpoint stay the plugin's.
 */
const TotpSetupView: React.FC<AdminViewServerProps> = async (props) => {
  const { issuer } = await resolveTotpIssuer(props.initPageResult.req);

  return (
    <TOTPSetup
      {...props}
      pluginOptions={{
        ...totpOptions,
        totp: { ...totpOptions.totp, issuer }
      }}
    />
  );
};

export default TotpSetupView;

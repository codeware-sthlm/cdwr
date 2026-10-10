import type { FlyApi, HostnameCheck } from '@cdwr/fly-node/api';

import { type CertificateState, toCertificateState } from './certificate-state';

/** What the panel may ask for */
export const CERTIFICATE_ACTIONS = ['request', 'check', 'remove'] as const;

export type CertificateAction = (typeof CERTIFICATE_ACTIONS)[number];

export type CertificateResult = {
  certificate: CertificateState | null;
  /** Live dns resolution, and whatever Fly objects to about it */
  check: HostnameCheck | null;
};

/**
 * Run one certificate action against Fly and fold the answer into row state.
 *
 * The app's addresses are only fetched for an apex certificate, the one case
 * that needs them. Errors propagate, including a failed address lookup: the
 * caller reports them, and a row stored without its addresses would read as if
 * there were none to configure.
 */
export const runCertificateAction = async (
  fly: FlyApi,
  app: string,
  hostname: string,
  action: CertificateAction,
  now: Date = new Date()
): Promise<CertificateResult> => {
  if (action === 'remove') {
    await fly.certs.remove(app, hostname);
    return { certificate: null, check: null };
  }

  const [certificate, check] =
    action === 'request'
      ? await fly.certs
          .add(app, hostname)
          .then(({ certificate, check }) => [certificate, check] as const)
      : await Promise.all([
          fly.certs.get(app, hostname),
          fly.certs.check(app, hostname)
        ]);

  const addresses = certificate?.isApex ? await fly.ips.list(app) : [];

  return {
    certificate: toCertificateState(certificate, now, addresses),
    check
  };
};

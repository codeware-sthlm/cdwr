import {
  type AppIpAddress,
  type Certificate,
  FlyApi
} from '@cdwr/fly-node/api';

import type { TenantDomain } from './tenant-domain';

/** What a domain row stores about its certificate */
export type CertificateState = {
  isConfigured: boolean;
  isApex: boolean;
  status: string | null;
  checkedAt: string;
  dnsValidationHostname: string | null;
  dnsValidationTarget: string | null;
  dnsValidationInstructions: string | null;
  rateLimitedUntil: string | null;
  /** Fly's own prose for a failed issuance attempt, oldest first */
  validationErrors: Array<string> | null;
  /** Who signed it, e.g. `lets_encrypt` */
  certificateAuthority: string | null;
  /**
   * The certificates Fly has actually issued, once any exist.
   *
   * Normally two rows sharing one expiry — Fly issues an RSA and an ECDSA
   * certificate per hostname — which is why the expiry, not the row count, is
   * the part worth reading.
   *
   * Always an array, never null, unlike `validationErrors` beside it. Payload's
   * write transform reads an `array` field with `typeof value === 'object' &&
   * '$push' in value`, and `typeof null` is `'object'` — so a null here throws
   * `Cannot use 'in' operator to search for '$push' in null` before anything is
   * written. Its `group` branch guards against null; the array branch does not.
   */
  issuedCertificates: Array<{ type: string; expiresAt: string }>;
  /**
   * The addresses an apex domain's A and AAAA records should point at.
   *
   * Empty for anything but an apex, which uses a CNAME instead. Always an
   * array, never null, for the reason given on `issuedCertificates`.
   */
  addresses: Array<{ type: 'A' | 'AAAA'; address: string }>;
};

/** Fly's address list as the A and AAAA records it asks for */
const toAddressRecords = (
  addresses: Array<AppIpAddress>
): CertificateState['addresses'] => {
  const records: CertificateState['addresses'] = [];

  for (const { type, address } of addresses) {
    if (type === 'v4' || type === 'shared_v4') {
      records.push({ type: 'A', address });
    } else if (type === 'v6') {
      records.push({ type: 'AAAA', address });
    }
    // Private addresses and anything Fly adds later are not for a registrar
  }

  return records;
};

/**
 * Fold a Fly certificate into the fields a domain row keeps.
 *
 * Stored rather than fetched on every render for two reasons: the tenant view
 * should not go down with Fly, and the boot read that decides which url an app
 * calls its own cannot make a network call at all. `checkedAt` is what keeps
 * that honest — a stale answer is fine as long as it says when it was true.
 *
 * The dns fields come along because they are what the operator needs *while*
 * they walk away to their registrar. Holding them only in the browser would
 * lose them on the first reload, at exactly the wrong moment.
 *
 * @param certificate - What Fly returned, or `null` when none exists yet
 * @param now - Injectable clock, so a test can assert the stamp
 * @param addresses - The app's addresses, kept only for an apex certificate
 */
export const toCertificateState = (
  certificate: Certificate | null,
  now: Date = new Date(),
  addresses: Array<AppIpAddress> = []
): CertificateState => {
  const checkedAt = now.toISOString();

  if (!certificate) {
    // Not an error - nobody has requested one yet, and the panel says so
    return {
      isConfigured: false,
      isApex: false,
      status: null,
      checkedAt,
      dnsValidationHostname: null,
      dnsValidationTarget: null,
      dnsValidationInstructions: null,
      rateLimitedUntil: null,
      validationErrors: null,
      certificateAuthority: null,
      issuedCertificates: [],
      addresses: []
    };
  }

  const dns = FlyApi.dnsInstructions(certificate);

  const issued = (certificate.issued?.nodes ?? [])
    .filter(
      (node): node is { type: string; expiresAt: string } =>
        Boolean(node.type) && Boolean(node.expiresAt)
    )
    .map(({ type, expiresAt }) => ({ type, expiresAt }));

  return {
    isConfigured: certificate.isConfigured,
    isApex: certificate.isApex ?? false,
    status: certificate.clientStatus ?? null,
    checkedAt,
    dnsValidationHostname: dns.hostname ?? null,
    dnsValidationTarget: dns.target ?? null,
    dnsValidationInstructions: dns.instructions ?? null,
    rateLimitedUntil: certificate.rateLimitedUntil ?? null,
    validationErrors: certificate.validationErrors?.length
      ? certificate.validationErrors.map((error) => error.message)
      : null,
    certificateAuthority: certificate.certificateAuthority ?? null,
    // Both halves have to be there to be worth a row: a type with no expiry
    // says nothing the status line does not already say
    issuedCertificates: issued,
    addresses: certificate.isApex ? toAddressRecords(addresses) : []
  };
};

/**
 * Write one domain's certificate state back into the tenant's rows.
 *
 * Returns a new array rather than editing in place, and touches only the row
 * whose hostname matches: an update writes the whole `domains` field back, so
 * rebuilding it from anything less than every row would quietly drop the
 * others.
 *
 * @param state - Fresh state, or `null` to forget a removed certificate
 */
export const applyCertificateState = <T extends TenantDomain>(
  domains: Array<T>,
  hostname: string,
  state: CertificateState | null
): Array<T> =>
  domains.map((domain) =>
    domain.hostname === hostname
      ? // The generated row type states the certificate group more narrowly
        // than the loose read shape, and a fresh state satisfies both
        ({ ...domain, certificate: state } as T)
      : domain
  );

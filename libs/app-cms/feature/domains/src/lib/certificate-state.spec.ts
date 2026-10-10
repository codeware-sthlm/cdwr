import type { Certificate } from '@cdwr/fly-node/api';
import { describe, expect, it } from 'vitest';

import { applyCertificateState, toCertificateState } from './certificate-state';
import type { TenantDomain } from './tenant-domain';

const now = new Date('2026-08-14T10:00:00.000Z');

const certificate = (overrides: Partial<Certificate> = {}): Certificate => ({
  hostname: 'tours.example.com',
  isConfigured: false,
  isApex: false,
  clientStatus: 'Awaiting configuration',
  dnsValidationHostname: '_acme-challenge.tours.example.com',
  dnsValidationTarget: 'tours.example.com.abc.flydns.net',
  dnsValidationInstructions: 'Add a CNAME record …',
  ...overrides
});

describe('toCertificateState', () => {
  it('keeps what the operator needs while they walk to their registrar', () => {
    expect(toCertificateState(certificate(), now)).toEqual({
      isConfigured: false,
      isApex: false,
      status: 'Awaiting configuration',
      checkedAt: '2026-08-14T10:00:00.000Z',
      dnsValidationHostname: '_acme-challenge.tours.example.com',
      dnsValidationTarget: 'tours.example.com.abc.flydns.net',
      dnsValidationInstructions: 'Add a CNAME record …',
      rateLimitedUntil: null,
      validationErrors: null,
      certificateAuthority: null,
      issuedCertificates: [],
      addresses: []
    });
  });

  describe('addresses', () => {
    const ips = [
      { address: '66.241.124.1', type: 'shared_v4' },
      { address: '137.66.0.1', type: 'v4' },
      { address: '2a09:8280:1::1', type: 'v6' },
      { address: 'fdaa:0:1::1', type: 'private_v6' }
    ];

    it('maps an apex certificate’s addresses to A and AAAA records', () => {
      const state = toCertificateState(certificate({ isApex: true }), now, ips);

      expect(state.addresses).toEqual([
        { type: 'A', address: '66.241.124.1' },
        { type: 'A', address: '137.66.0.1' },
        { type: 'AAAA', address: '2a09:8280:1::1' }
      ]);
    });

    it('keeps none for a subdomain, which uses a CNAME', () => {
      expect(toCertificateState(certificate(), now, ips).addresses).toEqual([]);
    });

    it('keeps none when there is no certificate', () => {
      expect(toCertificateState(null, now, ips).addresses).toEqual([]);
    });
  });

  it('carries the issued certificates and who signed them', () => {
    const state = toCertificateState(
      certificate({
        isConfigured: true,
        certificateAuthority: 'lets_encrypt',
        issued: {
          nodes: [
            { type: 'RSA', expiresAt: '2026-11-15T00:28:19Z' },
            { type: 'ECDSA', expiresAt: '2026-11-15T00:28:19Z' }
          ]
        }
      }),
      now
    );

    expect(state.certificateAuthority).toBe('lets_encrypt');
    expect(state.issuedCertificates).toEqual([
      { type: 'RSA', expiresAt: '2026-11-15T00:28:19Z' },
      { type: 'ECDSA', expiresAt: '2026-11-15T00:28:19Z' }
    ]);
  });

  it('drops an issued row missing the half that carries the meaning', () => {
    const state = toCertificateState(
      certificate({
        issued: {
          nodes: [
            { type: 'RSA', expiresAt: null },
            { type: null, expiresAt: '2026-11-15T00:28:19Z' },
            { type: 'ECDSA', expiresAt: '2026-11-15T00:28:19Z' }
          ]
        }
      }),
      now
    );

    expect(state.issuedCertificates).toEqual([
      { type: 'ECDSA', expiresAt: '2026-11-15T00:28:19Z' }
    ]);
  });

  it('never writes null for the issued rows, which Payload cannot store', () => {
    // Payload's array write transform does `'$push' in value` without a null
    // check, and `typeof null` is `'object'` — a null here throws before the
    // update reaches the database. Empty has to be an empty array.
    for (const value of [
      certificate({ issued: { nodes: [] } }),
      certificate({ issued: null }),
      certificate()
    ]) {
      expect(toCertificateState(value, now).issuedCertificates).toEqual([]);
    }
    expect(toCertificateState(null, now).issuedCertificates).toEqual([]);
  });

  it('carries Fly’s own prose for a failed issuance attempt', () => {
    const state = toCertificateState(
      certificate({
        validationErrors: [
          {
            message: 'No AAAA records were found for your domain',
            timestamp: '2026-08-14T09:00:00Z'
          },
          { message: 'DNS not configured', timestamp: '2026-08-14T09:30:00Z' }
        ]
      }),
      now
    );

    expect(state.validationErrors).toEqual([
      'No AAAA records were found for your domain',
      'DNS not configured'
    ]);
  });

  it('reads no validation errors as none, not an empty list', () => {
    expect(
      toCertificateState(certificate({ validationErrors: [] }), now)
        .validationErrors
    ).toBeNull();
  });

  it('records an issued certificate as serving', () => {
    const state = toCertificateState(
      certificate({ isConfigured: true, clientStatus: 'Ready' }),
      now
    );

    expect(state.isConfigured).toBe(true);
    expect(state.status).toBe('Ready');
  });

  it('carries a rate limit through, which correcting dns cannot fix', () => {
    const state = toCertificateState(
      certificate({ rateLimitedUntil: '2026-08-15T10:00:00Z' }),
      now
    );

    expect(state.rateLimitedUntil).toBe('2026-08-15T10:00:00Z');
  });

  it('takes isApex from Fly rather than counting labels', () => {
    // `example.co.uk` is an apex with three labels, so guessing would be wrong
    expect(toCertificateState(certificate({ isApex: true }), now).isApex).toBe(
      true
    );
  });

  it('reads a missing certificate as "not requested", not as an error', () => {
    const state = toCertificateState(null, now);

    expect(state).toMatchObject({ isConfigured: false, status: null });
    expect(state.checkedAt).toBe('2026-08-14T10:00:00.000Z');
  });

  it('stamps when it was true, so a stale answer stays honest', () => {
    expect(toCertificateState(null).checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('applyCertificateState', () => {
  const domains: Array<TenantDomain> = [
    { hostname: 'a.example.com', app: 'web' },
    { hostname: 'b.example.com', app: 'web', isPrimary: true }
  ];

  it('touches only the row it names', () => {
    const state = toCertificateState(certificate(), now);
    const result = applyCertificateState(domains, 'a.example.com', state);

    expect(result[0].certificate).toEqual(state);
    expect(result[1]).toEqual(domains[1]);
  });

  it('keeps the other fields on the row it updates', () => {
    const result = applyCertificateState(
      domains,
      'b.example.com',
      toCertificateState(null, now)
    );

    expect(result[1]).toMatchObject({
      hostname: 'b.example.com',
      app: 'web',
      isPrimary: true
    });
  });

  it('forgets the certificate of a removed domain', () => {
    const withState = applyCertificateState(
      domains,
      'a.example.com',
      toCertificateState(certificate(), now)
    );

    expect(
      applyCertificateState(withState, 'a.example.com', null)[0].certificate
    ).toBeNull();
  });

  it('returns every row, so a partial write cannot drop the rest', () => {
    // Payload replaces the whole array field on update
    expect(
      applyCertificateState(domains, 'nobody.example.com', null)
    ).toHaveLength(2);
  });

  it('does not edit the array it was given', () => {
    applyCertificateState(domains, 'a.example.com', toCertificateState(null));

    expect(domains[0]).not.toHaveProperty('certificate');
  });
});

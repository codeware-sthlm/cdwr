import type { Certificate, FlyApi, HostnameCheck } from '@cdwr/fly-node/api';
import { describe, expect, it, vi } from 'vitest';

import { runCertificateAction } from './certificate-action';

const now = new Date('2026-08-14T10:00:00.000Z');

const certificate = (isApex: boolean): Certificate => ({
  hostname: 'cdwr.io',
  isConfigured: false,
  isApex,
  clientStatus: 'Awaiting configuration'
});

const check: HostnameCheck = {};

const ips = [
  { address: '66.241.124.1', type: 'shared_v4' },
  { address: '2a09:8280:1::1', type: 'v6' }
];

const stubFly = (
  overrides: {
    cert?: Certificate | null;
    list?: () => Promise<typeof ips>;
  } = {}
) => {
  const cert =
    overrides.cert === undefined ? certificate(true) : overrides.cert;
  const list = vi.fn(overrides.list ?? (async () => ips));
  const fly = {
    certs: {
      add: vi.fn(async () => ({ certificate: cert, check })),
      get: vi.fn(async () => cert),
      check: vi.fn(async () => check),
      remove: vi.fn(async () => undefined)
    },
    ips: { list }
  } as unknown as FlyApi;
  return { fly, list };
};

describe('runCertificateAction', () => {
  it('stores the addresses when an apex certificate is requested', async () => {
    const { fly, list } = stubFly();

    const result = await runCertificateAction(
      fly,
      'cdwr-cms',
      'cdwr.io',
      'request',
      now
    );

    expect(list).toHaveBeenCalledWith('cdwr-cms');
    expect(result.certificate?.addresses).toEqual([
      { type: 'A', address: '66.241.124.1' },
      { type: 'AAAA', address: '2a09:8280:1::1' }
    ]);
    expect(result.check).toBe(check);
  });

  it('never asks for addresses on a subdomain', async () => {
    const { fly, list } = stubFly({ cert: certificate(false) });

    const result = await runCertificateAction(
      fly,
      'cdwr-cms',
      'tours.cdwr.io',
      'request',
      now
    );

    expect(list).not.toHaveBeenCalled();
    expect(result.certificate?.addresses).toEqual([]);
  });

  it('checks an apex certificate and stores its addresses', async () => {
    const { fly, list } = stubFly();

    const result = await runCertificateAction(
      fly,
      'cdwr-cms',
      'cdwr.io',
      'check',
      now
    );

    expect(list).toHaveBeenCalledOnce();
    expect(result.certificate?.addresses).toHaveLength(2);
  });

  it('skips the address lookup when a check finds no certificate', async () => {
    const { fly, list } = stubFly({ cert: null });

    const result = await runCertificateAction(
      fly,
      'cdwr-cms',
      'cdwr.io',
      'check',
      now
    );

    expect(list).not.toHaveBeenCalled();
    expect(result.certificate?.isConfigured).toBe(false);
  });

  it('rejects when the address lookup fails', async () => {
    const { fly } = stubFly({
      list: async () => {
        throw new Error('Fly is down');
      }
    });

    await expect(
      runCertificateAction(fly, 'cdwr-cms', 'cdwr.io', 'request', now)
    ).rejects.toThrow('Fly is down');
  });

  it('removes the certificate and answers with nothing', async () => {
    const { fly, list } = stubFly();

    const result = await runCertificateAction(
      fly,
      'cdwr-cms',
      'cdwr.io',
      'remove'
    );

    expect(fly.certs.remove).toHaveBeenCalledWith('cdwr-cms', 'cdwr.io');
    expect(list).not.toHaveBeenCalled();
    expect(result).toEqual({ certificate: null, check: null });
  });
});

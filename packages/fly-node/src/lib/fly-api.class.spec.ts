import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlyApi } from './fly-api.class';

/** Shaped as Fly's schema actually returns it, verified by introspection */
const certificate = {
  id: 'cert_1',
  hostname: 'tours.example.com',
  isConfigured: false,
  isApex: false,
  isAcmeDnsConfigured: false,
  isAcmeAlpnConfigured: false,
  certificateAuthority: 'lets_encrypt',
  createdAt: '2026-08-13T10:00:00Z',
  dnsProvider: 'enom',
  dnsValidationHostname: '_acme-challenge.tours.example.com',
  dnsValidationTarget: 'tours.example.com.abc.flydns.net',
  dnsValidationInstructions: 'Add a CNAME record …',
  clientStatus: 'Awaiting configuration',
  rateLimitedUntil: null,
  source: 'fly'
};

const check = {
  aRecords: [],
  cnameRecords: ['tours.example.com.abc.flydns.net'],
  dnsConfigured: false,
  acmeDnsConfigured: false,
  resolvedAddresses: []
};

/** Fly answers every query with 200; failures live in the body */
const respond = (body: unknown, ok = true, status = 200) =>
  Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'Unauthorized',
    json: () => Promise.resolve(body)
  } as Response);

const fetchMock = vi.fn();

const api = () =>
  new FlyApi({ token: 'fly_token', apiUrl: 'https://api.test/graphql' });

describe('FlyApi', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('refuses to be built without a token', () => {
    expect(() => new FlyApi({ token: '' })).toThrow('token is required');
  });

  it('authenticates with a bearer token', async () => {
    fetchMock.mockReturnValue(
      respond({ data: { addCertificate: { certificate, check } } })
    );

    await api().certs.add('cdwr-web-moon', 'tours.example.com');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/graphql');
    expect(init.headers.Authorization).toBe('Bearer fly_token');
    expect(JSON.parse(init.body).variables).toEqual({
      appId: 'cdwr-web-moon',
      hostname: 'tours.example.com'
    });
  });

  it('returns a pending certificate with what DNS still needs', async () => {
    fetchMock.mockReturnValue(
      respond({ data: { addCertificate: { certificate, check } } })
    );

    const result = await api().certs.add('cdwr-web-moon', 'tours.example.com');

    expect(result.certificate.isConfigured).toBe(false);
    expect(FlyApi.dnsInstructions(result.certificate)).toEqual({
      hostname: '_acme-challenge.tours.example.com',
      target: 'tours.example.com.abc.flydns.net',
      instructions: 'Add a CNAME record …',
      isApex: false
    });
  });

  it('reports what Fly resolves for the hostname right now', async () => {
    fetchMock.mockReturnValue(
      respond({ data: { addCertificate: { certificate, check } } })
    );

    const result = await api().certs.add('cdwr-web-moon', 'tours.example.com');

    expect(result.check?.dnsConfigured).toBe(false);
    expect(result.check?.cnameRecords).toEqual([
      'tours.example.com.abc.flydns.net'
    ]);
  });

  it('re-reads the certificate when Fly refuses a hostname it already has', async () => {
    // Fly's own mutation is not idempotent — a second request for the same
    // hostname on the same app is an error, not a no-op
    fetchMock
      .mockReturnValueOnce(
        respond({
          errors: [{ message: 'Hostname already exists on app' }]
        })
      )
      .mockReturnValueOnce(respond({ data: { app: { certificate } } }));

    const result = await api().certs.add('cdwr-web-moon', 'tours.example.com');

    expect(result.certificate.hostname).toBe('tours.example.com');
    expect(result.check).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still throws when the existing certificate cannot be re-read', async () => {
    fetchMock
      .mockReturnValueOnce(
        respond({
          errors: [{ message: 'Hostname already exists on app' }]
        })
      )
      .mockReturnValueOnce(respond({ data: { app: { certificate: null } } }));

    await expect(
      api().certs.add('cdwr-web-moon', 'tours.example.com')
    ).rejects.toThrow('already exists');
  });

  it('carries Fly’s own prose for a failed validation attempt', async () => {
    // Unlike a `HostnameCheck`'s errors, which are bare codes, this is what
    // Fly's own dashboard shows
    fetchMock.mockReturnValue(
      respond({
        data: {
          app: {
            certificate: {
              ...certificate,
              validationErrors: [
                {
                  message: 'No AAAA records were found for your domain',
                  timestamp: '2026-08-14T10:00:00Z'
                }
              ]
            }
          }
        }
      })
    );

    const result = await api().certs.get('cdwr-web-moon', 'tours.example.com');

    expect(result?.validationErrors).toEqual([
      {
        message: 'No AAAA records were found for your domain',
        timestamp: '2026-08-14T10:00:00Z'
      }
    ]);
  });

  it('surfaces a rate limit, which correcting dns cannot fix', async () => {
    fetchMock.mockReturnValue(
      respond({
        data: {
          app: {
            certificate: {
              ...certificate,
              rateLimitedUntil: '2026-08-14T10:00:00Z'
            }
          }
        }
      })
    );

    const result = await api().certs.get('cdwr-web-moon', 'tours.example.com');

    expect(result?.rateLimitedUntil).toBe('2026-08-14T10:00:00Z');
  });

  it('answers null for a hostname the app has no certificate for', async () => {
    // Fly reports this as a NOT_FOUND *error* alongside a null field, not as a
    // plain null — asserting the shape it never sends is how a mocked test
    // passes while the real call throws
    fetchMock.mockReturnValue(
      respond({
        data: { app: { certificate: null } },
        errors: [
          {
            message: 'Could not find AppCertificate',
            extensions: { code: 'NOT_FOUND' }
          }
        ]
      })
    );

    await expect(
      api().certs.get('cdwr-web-moon', 'unknown.example.com')
    ).resolves.toBeNull();
  });

  it('reports the validation issues Fly raises against a domain', async () => {
    // `checkCertificate` is a mutation despite reading rather than writing —
    // `HostnameCheck` is only ever returned by it and by `addCertificate`,
    // never as a plain field a query can select
    fetchMock.mockReturnValue(
      respond({
        data: {
          checkCertificate: {
            check: {
              ...check,
              dnsVerificationRecord: 'app-w0608qd',
              errors: ['No AAAA records were found for your domain']
            }
          }
        }
      })
    );

    const result = await api().certs.check(
      'cdwr-web-moon',
      'tours.example.com'
    );

    expect(result?.errors).toEqual([
      'No AAAA records were found for your domain'
    ]);
    // The value for the `_fly-ownership` TXT record, which is how a domain
    // behind a proxy proves itself
    expect(result?.dnsVerificationRecord).toBe('app-w0608qd');
  });

  it('answers null for a check on a hostname with no certificate', async () => {
    fetchMock.mockReturnValue(
      respond({
        data: { checkCertificate: null },
        errors: [
          {
            message: 'Could not find AppCertificate',
            extensions: { code: 'NOT_FOUND' }
          }
        ]
      })
    );

    await expect(
      api().certs.check('cdwr-web-moon', 'unknown.example.com')
    ).resolves.toBeNull();
  });

  it('still throws when only some errors are NOT_FOUND', async () => {
    fetchMock.mockReturnValue(
      respond({
        data: { app: null },
        errors: [
          {
            message: 'Could not find AppCertificate',
            extensions: { code: 'NOT_FOUND' }
          },
          {
            message: 'You must be authenticated',
            extensions: { code: 'UNAUTHORIZED' }
          }
        ]
      })
    );

    await expect(
      api().certs.get('cdwr-web-moon', 'unknown.example.com')
    ).rejects.toThrow('authenticated');
  });

  it('lists certificates, and an app with none', async () => {
    fetchMock.mockReturnValue(
      respond({ data: { app: { certificates: { nodes: [certificate] } } } })
    );
    await expect(api().certs.list('cdwr-web-moon')).resolves.toHaveLength(1);

    fetchMock.mockReturnValue(respond({ data: { app: null } }));
    await expect(api().certs.list('gone')).resolves.toEqual([]);
  });

  it('lists addresses with the shared v4 folded in, as the cli does', async () => {
    fetchMock.mockReturnValue(
      respond({
        data: {
          app: {
            sharedIpAddress: '192.0.2.10',
            ipAddresses: {
              nodes: [
                { address: '2001:db8::1', type: 'v6' },
                { address: 'fdaa:0:1::3', type: 'private_v6' }
              ]
            }
          }
        }
      })
    );

    await expect(api().ips.list('cdwr-web-moon')).resolves.toEqual([
      { address: '192.0.2.10', type: 'shared_v4' },
      { address: '2001:db8::1', type: 'v6' },
      { address: 'fdaa:0:1::3', type: 'private_v6' }
    ]);
  });

  it('lists no shared v4 when the app has none, and nothing for a missing app', async () => {
    fetchMock.mockReturnValue(
      respond({
        data: {
          app: {
            sharedIpAddress: null,
            ipAddresses: { nodes: [{ address: '192.0.2.20', type: 'v4' }] }
          }
        }
      })
    );
    await expect(api().ips.list('cdwr-web-moon')).resolves.toEqual([
      { address: '192.0.2.20', type: 'v4' }
    ]);

    fetchMock.mockReturnValue(respond({ data: { app: null } }));
    await expect(api().ips.list('gone')).resolves.toEqual([]);

    fetchMock.mockReturnValue(
      respond({
        errors: [
          { message: 'Could not find App', extensions: { code: 'NOT_FOUND' } }
        ]
      })
    );
    await expect(api().ips.list('gone')).resolves.toEqual([]);
  });

  it('surfaces a GraphQL error rather than failing to parse', async () => {
    // Fly rejects with 200 and an errors array — trusting the status alone
    // would turn "permission denied" into a confusing parse failure
    fetchMock.mockReturnValue(
      respond({ errors: [{ message: 'You must be authenticated' }] })
    );

    await expect(
      api().certs.add('cdwr-web-moon', 'tours.example.com')
    ).rejects.toThrow('You must be authenticated');
  });

  it('separates an unreachable Fly from a rejection', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(api().certs.list('cdwr-web-moon')).rejects.toThrow(
      'could not reach Fly'
    );
  });

  it('reports a non-2xx response', async () => {
    fetchMock.mockReturnValue(respond({}, false, 401));

    await expect(api().certs.list('cdwr-web-moon')).rejects.toThrow('401');
  });

  it('tolerates peripheral fields Fly may rename', async () => {
    // Strict on what a caller acts on, lenient elsewhere: a domains screen
    // should not stop rendering because `dnsProvider` changed shape
    fetchMock.mockReturnValue(
      respond({
        data: {
          app: {
            certificate: { hostname: 'tours.example.com', isConfigured: true }
          }
        }
      })
    );

    const result = await api().certs.get('cdwr-web-moon', 'tours.example.com');

    expect(result?.isConfigured).toBe(true);
  });

  it('never touches the filesystem or a binary', async () => {
    // The whole point of this class: it runs where flyctl does not exist
    fetchMock.mockReturnValue(
      respond({ data: { app: { certificates: { nodes: [] } } } })
    );

    await api().certs.list('cdwr-web-moon');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

/** Fly's REST answers, which fail by status rather than in the body */
const machine = (id: string, state = 'started') => ({
  id,
  name: `machine-${id}`,
  state,
  region: 'arn'
});

const restRespond = (body: unknown, ok = true, status = 200) =>
  Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'Not Found',
    json: () => Promise.resolve(body)
  } as Response);

const machinesApi = () =>
  new FlyApi({
    token: 'fly_token',
    machinesUrl: 'https://machines.test/v1'
  });

describe('FlyApi machines', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('lists machines from the rest api, not graphql', async () => {
    // GraphQL has no current equivalent — its machine mutations are Nomad-era
    fetchMock.mockReturnValue(restRespond([machine('a'), machine('b')]));

    await expect(machinesApi().machines.list('cdwr-web-moon')).resolves.toEqual(
      [machine('a'), machine('b')]
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://machines.test/v1/apps/cdwr-web-moon/machines'
    );
  });

  it('authenticates with the same bearer token', async () => {
    fetchMock.mockReturnValue(restRespond([]));

    await machinesApi().machines.list('cdwr-web-moon');

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer fly_token'
    );
  });

  it('tolerates a machine shape it does not fully recognise', async () => {
    fetchMock.mockReturnValue(restRespond([{ id: 'a' }]));

    await expect(
      machinesApi().machines.list('cdwr-web-moon')
    ).resolves.toHaveLength(1);
  });

  it('restarts every machine, one at a time', async () => {
    // Together would drop the whole app to apply a setting read at boot
    fetchMock
      .mockReturnValueOnce(restRespond([machine('a'), machine('b')]))
      .mockReturnValue(restRespond({ ok: true }));

    await expect(
      machinesApi().machines.restart('cdwr-web-moon')
    ).resolves.toEqual(['a', 'b']);

    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://machines.test/v1/apps/cdwr-web-moon/machines/a/restart'
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://machines.test/v1/apps/cdwr-web-moon/machines/b/restart'
    );
  });

  it('restarts one machine without listing them all', async () => {
    fetchMock.mockReturnValue(restRespond({ ok: true }));

    await expect(
      machinesApi().machines.restart('cdwr-web-moon', 'a')
    ).resolves.toEqual(['a']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops at a machine that will not restart', async () => {
    // Continuing would leave the app running two configurations at once
    fetchMock
      .mockReturnValueOnce(restRespond([machine('a'), machine('b')]))
      .mockReturnValueOnce(
        restRespond({ error: 'machine not found' }, false, 404)
      );

    await expect(
      machinesApi().machines.restart('cdwr-web-moon')
    ).rejects.toThrow('machine not found');
  });

  it('reports the reason a rest call failed, not just its status', async () => {
    fetchMock.mockReturnValue(
      restRespond({ error: 'You are not authorized' }, false, 401)
    );

    await expect(machinesApi().machines.list('gone')).rejects.toThrow(
      'You are not authorized'
    );
  });

  it('falls back to the status when there is no reason', async () => {
    fetchMock.mockReturnValue(restRespond(null, false, 404));

    await expect(machinesApi().machines.list('gone')).rejects.toThrow('404');
  });

  it('restarts nothing on an app with no machines', async () => {
    fetchMock.mockReturnValue(restRespond([]));

    await expect(
      machinesApi().machines.restart('cdwr-web-moon')
    ).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('separates an unreachable Fly from a rejection', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(machinesApi().machines.list('cdwr-web-moon')).rejects.toThrow(
      'could not reach Fly'
    );
  });
});

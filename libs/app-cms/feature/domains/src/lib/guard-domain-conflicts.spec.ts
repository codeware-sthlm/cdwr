import { beforeEach, describe, expect, it, vi } from 'vitest';

import { guardDomainConflicts } from './guard-domain-conflicts';
import type { TenantWithDomains } from './tenant-domain';

type HookArgs = Parameters<typeof guardDomainConflicts>[0];

/** What each collection's cross-claim lookup finds, keyed by slug */
let claimed: Record<
  'tenants' | 'platform-settings',
  Array<TenantWithDomains>
> = {
  tenants: [],
  'platform-settings': []
};

const find = vi.fn(
  async ({ collection }: { collection: 'tenants' | 'platform-settings' }) => ({
    docs: claimed[collection]
  })
);

const req = () =>
  ({
    payload: { find },
    // The translated message is asserted through its key, not its wording
    t: (key: string) => key
  }) as unknown as HookArgs['req'];

const invoke = (
  data: Partial<TenantWithDomains>,
  options: {
    originalDoc?: Partial<TenantWithDomains>;
    collection?: 'tenants' | 'platform-settings';
  } = {}
): Promise<unknown> =>
  guardDomainConflicts({
    collection: { slug: options.collection ?? 'tenants' },
    data,
    originalDoc: options.originalDoc,
    req: req()
  } as unknown as HookArgs) as Promise<unknown>;

const moon = { id: 1, name: 'Moon' };

describe('guardDomainConflicts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimed = { tenants: [], 'platform-settings': [] };
  });

  it('accepts distinct domains', async () => {
    await expect(
      invoke({
        ...moon,
        domains: [
          { hostname: 'tours.example.com', app: 'cdwr-web-moon' },
          { hostname: 'example.com', app: 'cdwr-web-moon' }
        ]
      })
    ).resolves.toBeDefined();
  });

  it('refuses the same hostname listed twice', async () => {
    await expect(
      invoke({
        ...moon,
        domains: [
          { hostname: 'tours.example.com', app: 'cdwr-web-moon' },
          { hostname: 'tours.example.com', app: 'cdwr-cms-moon' }
        ]
      })
    ).rejects.toThrow('validation:domainDuplicate');
  });

  it('refuses two primaries for one app', async () => {
    await expect(
      invoke({
        ...moon,
        domains: [
          { hostname: 'a.example.com', app: 'cdwr-web-moon', isPrimary: true },
          { hostname: 'b.example.com', app: 'cdwr-web-moon', isPrimary: true }
        ]
      })
    ).rejects.toThrow('validation:domainOnePrimary');
  });

  it('allows one primary per app across different apps', async () => {
    await expect(
      invoke({
        ...moon,
        domains: [
          { hostname: 'a.example.com', app: 'cdwr-web-moon', isPrimary: true },
          { hostname: 'b.example.com', app: 'cdwr-cms-moon', isPrimary: true }
        ]
      })
    ).resolves.toBeDefined();
  });

  it('refuses a hostname another workspace already claims', async () => {
    claimed.tenants = [
      { id: 2, name: 'Titan', domains: [{ hostname: 'tours.example.com' }] }
    ];

    await expect(
      invoke({
        ...moon,
        domains: [{ hostname: 'tours.example.com', app: 'cdwr-web-moon' }]
      })
    ).rejects.toThrow('validation:domainTaken');
  });

  it('does not treat a tenant own stored rows as a conflict', async () => {
    // Every update matches itself, which would make a domain unsavable twice
    claimed.tenants = [
      { id: 1, name: 'Moon', domains: [{ hostname: 'tours.example.com' }] }
    ];

    await expect(
      invoke(
        {
          ...moon,
          domains: [{ hostname: 'tours.example.com', app: 'cdwr-web-moon' }]
        },
        { originalDoc: moon }
      )
    ).resolves.toBeDefined();
  });

  it('compares ids across the string and number forms payload uses', async () => {
    claimed.tenants = [
      { id: '1', name: 'Moon', domains: [{ hostname: 'tours.example.com' }] }
    ];

    await expect(
      invoke(
        { domains: [{ hostname: 'tours.example.com', app: 'cdwr-web-moon' }] },
        { originalDoc: { id: 1, name: 'Moon' } }
      )
    ).resolves.toBeDefined();
  });

  it('queries every domain-owning collection once, covering every hostname at once', async () => {
    await invoke({
      ...moon,
      domains: [
        { hostname: 'a.example.com', app: 'web' },
        { hostname: 'b.example.com', app: 'web' }
      ]
    });

    expect(find).toHaveBeenCalledTimes(2);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'tenants',
        where: {
          'domains.hostname': { in: ['a.example.com', 'b.example.com'] }
        }
      })
    );
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'platform-settings',
        where: {
          'domains.hostname': { in: ['a.example.com', 'b.example.com'] }
        }
      })
    );
  });

  it('ignores a half-filled row rather than claiming a nameless domain', async () => {
    // The admin adds an empty row the moment you click "Add"
    await invoke({ ...moon, domains: [{ hostname: '', app: '' }] });

    expect(find).not.toHaveBeenCalled();
  });

  it('reads other workspaces regardless of who is saving', async () => {
    // A conflicting domain must be found even when the reader cannot see that
    // workspace, or the check would pass for exactly the people it guards
    await invoke({
      ...moon,
      domains: [{ hostname: 'a.example.com', app: 'web' }]
    });

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ overrideAccess: true })
    );
  });

  describe('across collections', () => {
    it('refuses a tenant claiming a hostname the platform already uses', async () => {
      claimed['platform-settings'] = [
        { id: 1, domains: [{ hostname: 'cms.example.com' }] }
      ];

      await expect(
        invoke({
          ...moon,
          domains: [{ hostname: 'cms.example.com', app: 'cdwr-cms' }]
        })
      ).rejects.toThrow('validation:domainTaken');
    });

    it('refuses the platform claiming a hostname a tenant already uses', async () => {
      claimed.tenants = [
        { id: 1, name: 'Moon', domains: [{ hostname: 'tours.example.com' }] }
      ];

      await expect(
        invoke(
          {
            id: 1,
            domains: [{ hostname: 'tours.example.com', app: 'cdwr-cms' }]
          },
          { collection: 'platform-settings' }
        )
      ).rejects.toThrow('validation:domainTaken');
    });

    it('does not exclude a tenant by an id that only matches the platform row', async () => {
      // Ids are not unique across tables — a tenant #1 must not be treated as
      // "self" when the document being saved is platform-settings #1
      claimed.tenants = [
        { id: 1, name: 'Moon', domains: [{ hostname: 'shared.example.com' }] }
      ];

      await expect(
        invoke(
          {
            id: 1,
            domains: [{ hostname: 'shared.example.com', app: 'cdwr-cms' }]
          },
          { collection: 'platform-settings', originalDoc: { id: 1 } }
        )
      ).rejects.toThrow('validation:domainTaken');
    });
  });

  it('looks up the platform claims only after the tenant claims resolve', async () => {
    // Both lookups share the transaction's single pg client, so they must
    // run one after the other
    let release: (value: { docs: Array<TenantWithDomains> }) => void = () =>
      undefined;
    const pending = new Promise<{ docs: Array<TenantWithDomains> }>(
      (resolve) => {
        release = resolve;
      }
    );
    find.mockImplementationOnce(() => pending);

    const flush = () => new Promise((resolve) => setImmediate(resolve));

    const running = invoke({
      ...moon,
      domains: [{ hostname: 'tours.example.com', app: 'cdwr-web-moon' }]
    });

    await flush();
    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenLastCalledWith(
      expect.objectContaining({ collection: 'tenants' })
    );

    release({ docs: [] });
    await flush();
    expect(find).toHaveBeenCalledTimes(2);
    expect(find).toHaveBeenLastCalledWith(
      expect.objectContaining({ collection: 'platform-settings' })
    );

    await running;
  });
});

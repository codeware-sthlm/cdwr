/**
 * @jest-environment node
 */
import type {
  Access,
  CollectionConfig,
  Config,
  Endpoint,
  Payload
} from 'payload';

import {
  enrolmentAccess,
  secondFactorEndpoint,
  totpEnrolmentPlugin
} from './totp-enrolment.plugin';

// ESM-only, pulled in by the access lib's barrel, and not what is under test
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));

type AccessArgs = Parameters<Access>[0];

const pendingAdmin = {
  id: 5,
  role: 'user',
  tenants: [{ tenant: 7, role: 'admin' }],
  _strategy: 'local-jwt'
};
const enrolledAdmin = { ...pendingAdmin, hasTotp: true, _strategy: 'totp' };
const member = {
  id: 6,
  role: 'user',
  tenants: [{ tenant: 7, role: 'user' }],
  _strategy: 'local-jwt'
};

const accessArgs = (user: unknown) =>
  ({ req: { user } }) as unknown as AccessArgs;

describe('enrolmentAccess', () => {
  it('refuses a pending user, even with an inner that allows', async () => {
    const inner = jest.fn().mockResolvedValue(true);

    expect(await enrolmentAccess(inner)(accessArgs(pendingAdmin))).toBe(false);
    expect(inner).not.toHaveBeenCalled();
  });

  it('refuses a pending user on own document without a user id match', async () => {
    expect(
      await enrolmentAccess(undefined, { ownDocument: false })(
        accessArgs(pendingAdmin)
      )
    ).toBe(false);
  });

  it.each([
    { name: 'inner true', inner: true, expected: { id: { equals: 5 } } },
    {
      name: 'inner where',
      inner: { tenant: { equals: 7 } },
      expected: { and: [{ tenant: { equals: 7 } }, { id: { equals: 5 } }] }
    },
    { name: 'inner false', inner: false, expected: false }
  ])(
    'own-document read for a pending user: $name',
    async ({ inner, expected }) => {
      const access = enrolmentAccess(jest.fn().mockResolvedValue(inner), {
        ownDocument: true
      });

      expect(await access(accessArgs(pendingAdmin))).toEqual(expected);
    }
  );

  it('limits a pending user to their own document without an inner access', async () => {
    expect(
      await enrolmentAccess(undefined, { ownDocument: true })(
        accessArgs(pendingAdmin)
      )
    ).toEqual({ id: { equals: 5 } });
  });

  it.each([
    { name: 'an enrolled admin', user: enrolledAdmin },
    { name: 'a member', user: member },
    { name: 'an anonymous request', user: null }
  ])('gives $name the inner result unchanged', async ({ user }) => {
    const where = { tenant: { equals: 7 } };
    const inner = jest.fn().mockResolvedValue(where);

    expect(await enrolmentAccess(inner)(accessArgs(user))).toBe(where);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('keeps an inner false false', async () => {
    expect(
      await enrolmentAccess(jest.fn().mockResolvedValue(false))(
        accessArgs(member)
      )
    ).toBe(false);
  });

  it.each([
    { name: 'a signed-in user', user: member, expected: true },
    { name: 'an anonymous request', user: null, expected: false }
  ])(
    'without an inner access, $name: $expected',
    async ({ user, expected }) => {
      expect(await enrolmentAccess(undefined)(accessArgs(user))).toBe(expected);
    }
  );
});

describe('secondFactorEndpoint', () => {
  const run = (endpoint: Endpoint, user: unknown) =>
    secondFactorEndpoint(endpoint).handler({
      user,
      t: (key: string) => key
    } as unknown as Parameters<Endpoint['handler']>[0]);

  it('answers 403 to a pending session without calling the handler', async () => {
    const handler = jest.fn();

    const response = await run(
      { path: '/x', method: 'get', handler } as Endpoint,
      pendingAdmin
    );

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      errors: [{ message: 'error:notAllowedToPerformAction' }]
    });
  });

  it.each([
    { name: 'an enrolled admin', user: enrolledAdmin },
    { name: 'a member', user: member },
    { name: 'an anonymous request', user: null }
  ])('calls the handler for $name', async ({ user }) => {
    const reply = Response.json({ ok: true });
    const handler = jest.fn().mockResolvedValue(reply);

    expect(
      await run({ path: '/x', method: 'get', handler } as Endpoint, user)
    ).toBe(reply);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('keeps the rest of the endpoint', () => {
    const wrapped = secondFactorEndpoint({
      path: '/x',
      method: 'post',
      handler: jest.fn()
    } as Endpoint);

    expect(wrapped).toMatchObject({ path: '/x', method: 'post' });
  });
});

describe('totpEnrolmentPlugin', () => {
  const handler = jest.fn();
  const endpoint = { path: '/e', method: 'get', handler } as Endpoint;
  const original: Access = jest.fn().mockResolvedValue(true);

  const collectionOps = [
    'create',
    'delete',
    'read',
    'readVersions',
    'unlock',
    'update'
  ];
  const globalOps = ['read', 'readVersions', 'update'];

  const build = (overrides: Partial<Config> = {}) =>
    ({
      admin: { components: { providers: ['existing#Provider'] } },
      collections: [
        {
          slug: 'users',
          access: { read: original },
          endpoints: [endpoint],
          fields: [{ name: 'name', type: 'text' }]
        },
        {
          slug: 'pages',
          endpoints: false,
          fields: [{ name: 'title', type: 'text' }]
        }
      ],
      globals: [
        {
          slug: 'settings',
          access: { update: original },
          endpoints: [endpoint]
        }
      ],
      endpoints: [endpoint],
      ...overrides
    }) as unknown as Config;

  const apply = async (config: Config) =>
    (await totpEnrolmentPlugin({ collection: 'users' })(config)) as Config & {
      collections: Array<CollectionConfig>;
    };

  it('wraps every collection operation', async () => {
    const result = await apply(build());

    for (const collection of result.collections) {
      for (const operation of collectionOps) {
        expect(
          (collection.access as Record<string, unknown>)[operation]
        ).toEqual(expect.any(Function));
      }
    }
    const users = result.collections[0].access as Record<string, Access>;
    expect(users['read']).not.toBe(original);
    expect(await users['update'](accessArgs(pendingAdmin))).toBe(false);
  });

  it('wraps every global operation', async () => {
    const result = await apply(build());
    const access = result.globals?.[0].access as Record<string, Access>;

    for (const operation of globalOps) {
      expect(access[operation]).toEqual(expect.any(Function));
    }
    expect(await access['update'](accessArgs(pendingAdmin))).toBe(false);
    expect(await access['update'](accessArgs(member))).toBe(true);
  });

  it('lets a pending user read only their own users document', async () => {
    const result = await apply(build({}));
    const users = result.collections[0].access as Record<string, Access>;
    const pages = result.collections[1].access as Record<string, Access>;

    expect(await users['read'](accessArgs(pendingAdmin))).toEqual({
      id: { equals: 5 }
    });
    expect(await pages['read'](accessArgs(pendingAdmin))).toBe(false);
  });

  it('adds a hidden virtual totpRequired field to the users collection only', async () => {
    const result = await apply(build());
    const [users, pages] = result.collections;
    const field = users.fields.find(
      (f) => 'name' in f && f.name === 'totpRequired'
    ) as unknown as {
      type: string;
      virtual: boolean;
      access: { read: (a: unknown) => boolean };
      hooks: { afterRead: Array<(a: unknown) => boolean> };
    };

    expect(users.fields).toHaveLength(2);
    expect(pages.fields).toHaveLength(1);
    expect(field).toMatchObject({ type: 'checkbox', virtual: true });
    expect(
      field.access.read({ data: { id: 5 }, req: { user: { id: 5 } } })
    ).toBe(true);
    expect(
      field.access.read({ data: { id: 5 }, req: { user: { id: 6 } } })
    ).toBe(false);
    expect(field.access.read({ data: { id: 5 }, req: { user: null } })).toBe(
      false
    );
    expect(field.hooks.afterRead[0]({ data: pendingAdmin })).toBe(true);
    expect(field.hooks.afterRead[0]({ data: member })).toBe(false);
  });

  it('wraps endpoints on config, collections and globals', async () => {
    const result = await apply(build());
    // A collection or global may turn its endpoints off with `false`
    const first = (endpoints: Config['endpoints'] | false | undefined) =>
      endpoints ? endpoints[0] : undefined;
    const wrapped = [
      first(result.endpoints),
      first(result.collections[0].endpoints),
      first(result.globals?.[0].endpoints)
    ] as Array<Endpoint>;

    for (const wrappedEndpoint of wrapped) {
      expect(wrappedEndpoint.handler).not.toBe(handler);
      expect(wrappedEndpoint.path).toBe('/e');
    }
  });

  it('preserves endpoints: false', async () => {
    const result = await apply(build());

    expect(result.collections[1].endpoints).toBe(false);
  });

  it('appends the provider path after existing providers', async () => {
    const result = await apply(build());

    expect(result.admin?.components?.providers).toEqual([
      'existing#Provider',
      '@codeware/apps/cms/components/admin/totp/TotpEnrolmentRedirect#TotpEnrolmentRedirect'
    ]);
  });

  it('handles a config without collections, globals or providers', async () => {
    const result = await apply({} as Config);

    expect(result.collections).toEqual([]);
    expect(result.globals).toEqual([]);
    expect(result.admin?.components?.providers).toHaveLength(1);
  });

  it('chains the original onInit and wraps the payload collections', async () => {
    const order: Array<string> = [];
    const originalOnInit = jest.fn(async () => {
      order.push('original');
    });
    const result = await apply(build({ onInit: originalOnInit }));
    const jobs = { slug: 'payload-jobs', access: {} };
    const locked = { slug: 'payload-locked-documents', access: {} };
    const folders = { slug: 'folders', access: {} };
    const other = { slug: 'pages', access: {} };
    const jobsStats = { slug: 'payload-jobs-stats', access: {} };
    const payload = {
      config: {
        folders: { slug: 'folders' },
        collections: [jobs, locked, folders, other],
        globals: [jobsStats]
      }
    } as unknown as Payload;

    await result.onInit?.(payload);

    expect(originalOnInit).toHaveBeenCalledWith(payload);
    expect(Object.keys(jobs.access).sort()).toEqual([...collectionOps].sort());
    expect(Object.keys(locked.access).sort()).toEqual(
      collectionOps.filter((operation) => operation !== 'read').sort()
    );
    expect(Object.keys(folders.access).sort()).toEqual(
      [...collectionOps].sort()
    );
    expect(other.access).toEqual({});
    expect(Object.keys(jobsStats.access).sort()).toEqual(
      ['read', 'readVersions', 'update'].sort()
    );
  });

  it('runs without an original onInit', async () => {
    const result = await apply(build());

    await expect(
      result.onInit?.({
        config: { collections: [] }
      } as unknown as Payload)
    ).resolves.toBeUndefined();
  });
});

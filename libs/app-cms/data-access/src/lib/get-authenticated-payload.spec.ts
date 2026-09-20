import type { SanitizedConfig } from 'payload';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The membership gate is a security boundary: it decides whether a request is
 * served as the visitor (who may read their workspace's gated content) or as
 * the tenant api key (who may not). These cases pin the gate shut.
 */

const mockGetTenantContext = vi.fn();
/** Resolves the api-key call and the session call separately */
const mockAuth = vi.fn();

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ cookie: 'payload-token=x' })
}));

vi.mock('payload', () => ({
  getPayload: async () => ({ auth: mockAuth })
}));

vi.mock('./get-tenant-context', () => ({
  getTenantContext: () => mockGetTenantContext()
}));

const { getAuthenticatedPayload } = await import('./get-authenticated-payload');

const tenantDoc = { id: 7, slug: 'moon', apiKey: 'k' };

/** A users-collection document; `isUser` keys on `role` + `tenants` */
const member = {
  id: 1,
  role: 'user',
  tenants: [{ tenant: 7, role: 'reader' }]
};
const outsider = {
  id: 2,
  role: 'user',
  tenants: [{ tenant: 8, role: 'reader' }]
};

/** Route the two `payload.auth` calls by whether an Authorization header is set */
const withSession = (sessionUser: unknown) =>
  mockAuth.mockImplementation(async ({ headers }: { headers: Headers }) =>
    headers.has('Authorization') ? { user: tenantDoc } : { user: sessionUser }
  );

const run = (options?: { asVisitor?: boolean }) =>
  getAuthenticatedPayload({} as SanitizedConfig, options);

beforeEach(() => {
  mockAuth.mockReset();
  mockGetTenantContext.mockReset();
  mockGetTenantContext.mockResolvedValue({ tenantApiKey: 'k' });
});

describe('getAuthenticatedPayload', () => {
  it('keeps the tenant api key by default, even for a member', async () => {
    // The fail-closed default: a write path that forgets the option keeps the
    // identity its access control and hooks are built around.
    withSession(member);
    const payload = await run();
    expect(payload.authenticatedUser).toBe(tenantDoc);
  });

  it('authenticates as a member of this workspace when asked', async () => {
    withSession(member);
    const payload = await run({ asVisitor: true });
    expect(payload.authenticatedUser).toBe(member);
  });

  it('accepts an editor of this workspace, who is also a member', async () => {
    // A board member who also edits still reads the member area. Drafts are
    // kept off the site by `asVisitor` on the runtime, not by refusing them an
    // identity here.
    const editor = {
      id: 3,
      role: 'user',
      tenants: [{ tenant: 7, role: 'admin' }]
    };
    withSession(editor);
    const payload = await run({ asVisitor: true });
    expect(payload.authenticatedUser).toBe(editor);
  });

  it('records whether this is a site render', async () => {
    withSession(member);
    expect((await run({ asVisitor: true })).asVisitor).toBe(true);
    expect((await run()).asVisitor).toBe(false);
  });

  it('refuses a member of another workspace', async () => {
    // Signed in, but not here — no more entitled than a stranger
    withSession(outsider);
    const payload = await run({ asVisitor: true });
    expect(payload.authenticatedUser).toBe(tenantDoc);
  });

  it('falls back to the tenant api key with no session', async () => {
    withSession(null);
    const payload = await run({ asVisitor: true });
    expect(payload.authenticatedUser).toBe(tenantDoc);
  });

  it('exposes the served tenant whichever identity wins', async () => {
    // The whole point of the split: site configuration must not depend on who
    // is signed in, or logging in would strip the site of its theme.
    withSession(member);
    expect((await run({ asVisitor: true })).tenant).toEqual(tenantDoc);
    expect((await run()).tenant).toEqual(tenantDoc);
  });

  it('has no tenant outside tenant mode', async () => {
    mockGetTenantContext.mockResolvedValue(null);
    mockAuth.mockResolvedValue({ user: member });
    const payload = await run({ asVisitor: true });
    expect(payload.tenant).toBeNull();
    expect(payload.authenticatedUser).toBe(member);
  });
});

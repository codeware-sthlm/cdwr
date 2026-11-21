/** @jest-environment node */
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import type { Agent } from '@codeware/shared/util/payload-types';
import { verifySignature } from '@codeware/shared/util/signature';
import type { AccessArgs } from 'payload';

import { resolveScopedTenant } from '../../../security/resolve-scoped-tenant';

import {
  agentDraftsWhere,
  agentMayCreate,
  agentOr,
  agentTenantId
} from './agent-post-access';

jest.mock('@codeware/app-cms/feature/env-loader', () => ({
  getEnv: jest.fn()
}));
// The misc barrel reaches this ESM-only module, which Jest cannot load
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));
jest.mock('../../../security/resolve-scoped-tenant', () => ({
  resolveScopedTenant: jest.fn()
}));
jest.mock('@codeware/shared/util/signature', () => ({
  verifySignature: jest.fn()
}));

const agent = { id: 3, collection: 'agents', tenant: 7 } as unknown as Agent;

const tenantKey = { id: 7, collection: 'tenants', slug: 'moon' };

const mode = (type: 'host' | 'tenant') =>
  jest.mocked(getEnv).mockReturnValue({
    APP_MODE:
      type === 'host'
        ? { type, signatureSecrets: ['secret'] }
        : { type, apiKey: 'key' }
  } as unknown as ReturnType<typeof getEnv>);

const args = (user: unknown, headers: Record<string, string> = {}) =>
  ({
    req: {
      user,
      headers: new Headers(headers),
      payload: { logger: { info: jest.fn(), warn: jest.fn() } }
    }
  }) as unknown as AccessArgs;

describe('agentOr', () => {
  const inner = jest.fn();
  const forAgent = jest.fn();
  const access = agentOr(inner, forAgent);

  beforeEach(() => {
    jest.resetAllMocks();
    inner.mockResolvedValue('inner');
    forAgent.mockReturnValue('agent');
  });

  it('leaves a non-agent to the wrapped access', async () => {
    const call = args(tenantKey);

    await expect(access(call)).resolves.toBe('inner');

    expect(inner).toHaveBeenCalledWith(call);
    expect(forAgent).not.toHaveBeenCalled();
  });

  it('leaves a missing user to the wrapped access', async () => {
    await expect(access(args(null))).resolves.toBe('inner');
    expect(forAgent).not.toHaveBeenCalled();
  });

  describe('in tenant mode', () => {
    beforeEach(() => {
      mode('tenant');
    });

    it('grants an agent of the served workspace what forAgent returns', async () => {
      jest.mocked(resolveScopedTenant).mockResolvedValue({ id: 7 } as never);
      const call = args(agent);

      await expect(access(call)).resolves.toBe('agent');

      expect(forAgent).toHaveBeenCalledWith(agent, call);
      expect(inner).not.toHaveBeenCalled();
    });

    it('refuses an agent of another workspace', async () => {
      jest.mocked(resolveScopedTenant).mockResolvedValue({ id: 8 } as never);

      await expect(access(args(agent))).resolves.toBe(false);
      expect(forAgent).not.toHaveBeenCalled();
    });

    it('refuses when no workspace is served', async () => {
      jest.mocked(resolveScopedTenant).mockResolvedValue(null as never);

      await expect(access(args(agent))).resolves.toBe(false);
      expect(forAgent).not.toHaveBeenCalled();
    });
  });

  describe('in host mode', () => {
    beforeEach(() => {
      mode('host');
    });

    it('refuses an external request with an invalid signature', async () => {
      jest
        .mocked(verifySignature)
        .mockReturnValue({ success: false, error: 'bad' } as never);

      await expect(access(args(agent, { host: 'cms.test' }))).resolves.toBe(
        false
      );
      expect(forAgent).not.toHaveBeenCalled();
    });

    it('grants an external request with a valid signature', async () => {
      jest.mocked(verifySignature).mockReturnValue({ success: true } as never);

      await expect(access(args(agent, { host: 'cms.test' }))).resolves.toBe(
        'agent'
      );
      expect(forAgent).toHaveBeenCalled();
    });

    it('skips the signature on a Local API call', async () => {
      await expect(access(args(agent))).resolves.toBe('agent');
      expect(verifySignature).not.toHaveBeenCalled();
    });
  });
});

describe('agentMayCreate', () => {
  it('allows creating', () => {
    expect(agentMayCreate()).toBe(true);
  });
});

describe('agentTenantId', () => {
  it('reads a tenant id and a populated tenant alike', () => {
    expect(agentTenantId(agent)).toBe(7);
    expect(
      agentTenantId({ ...agent, tenant: { id: 7 } } as unknown as Agent)
    ).toBe(7);
  });
});

describe('agentDraftsWhere', () => {
  it('limits a read to the agent’s own drafts in its workspace', () => {
    expect(agentDraftsWhere()(agent)).toEqual({
      and: [{ tenant: { equals: 7 } }, { draftedBy: { equals: 3 } }]
    });
  });

  it('prefixes the fields for version documents', () => {
    expect(agentDraftsWhere('version')(agent)).toEqual({
      and: [
        { 'version.tenant': { equals: 7 } },
        { 'version.draftedBy': { equals: 3 } }
      ]
    });
  });

  it('gives the same constraint for a populated tenant', () => {
    const populated = { ...agent, tenant: { id: 7 } } as unknown as Agent;

    expect(agentDraftsWhere()(populated)).toEqual(agentDraftsWhere()(agent));
  });
});

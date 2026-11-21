/** @jest-environment node */
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { resetRateLimits } from '@codeware/shared/util/human-check';
import { NextRequest } from 'next/server';
import { getPayload } from 'payload';

import { AVAILABLE_RATE_LIMIT, GET } from './route';

// ESM-only packages the data-access barrel pulls in
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));
jest.mock('@payloadcms/db-postgres', () => ({ sql: jest.fn() }));
jest.mock('@payloadcms/email-nodemailer', () => ({
  nodemailerAdapter: jest.fn()
}));
jest.mock('payload', () => ({
  getPayload: jest.fn(),
  ValidationError: class ValidationError extends Error {}
}));
jest.mock('@codeware/app-cms/feature/env-loader', () => ({
  getEnv: jest.fn()
}));
jest.mock('../../../../payload.config', () => ({}));

const payload = { count: jest.fn(), find: jest.fn() };

/** The settings read and the tenant name lookup answer apart */
const answer = (settings: Record<string, unknown>, names: string[] = []) =>
  payload.find.mockImplementation(async ({ collection }) => ({
    docs:
      collection === 'tenants' ? names.map((name) => ({ name })) : [settings]
  }));

const get = (name?: string) =>
  GET(
    new NextRequest(
      `https://cms.example/api/signup/available${
        name === undefined ? '' : `?name=${encodeURIComponent(name)}`
      }`,
      { headers: { 'x-forwarded-for': '203.0.113.7' } }
    )
  );

beforeEach(() => {
  jest.resetAllMocks();
  resetRateLimits();
  jest.mocked(getEnv).mockReturnValue({
    APP_MODE: { type: 'host' }
  } as ReturnType<typeof getEnv>);
  jest.mocked(getPayload).mockResolvedValue(payload as never);
  payload.count.mockResolvedValue({ totalDocs: 0 });
  answer({ signupOpen: true });
});

describe('GET /api/signup/available', () => {
  it('is not found in tenant mode, and does nothing', async () => {
    jest
      .mocked(getEnv)
      .mockReturnValue({ APP_MODE: { type: 'tenant' } } as ReturnType<
        typeof getEnv
      >);

    const response = await get('Ada Engines');

    expect(response.status).toBe(404);
    expect(getPayload).not.toHaveBeenCalled();
  });

  it('answers a name that gives no address without touching the database', async () => {
    const response = await get('!!!');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      available: false,
      issue: 'empty'
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(getPayload).not.toHaveBeenCalled();
  });

  it('answers a missing name as empty', async () => {
    const response = await get();

    expect(await response.json()).toEqual({ available: false, issue: 'empty' });
  });

  it('is not found while signup is closed, before any lookup', async () => {
    answer({ signupOpen: false });

    const response = await get('Ada Engines');

    expect(response.status).toBe(404);
    expect(payload.count).not.toHaveBeenCalled();
  });

  it('says a free address is available', async () => {
    const response = await get('Ada Engines');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('derives the address from the name, with Swedish letters folded', async () => {
    await get('Åsa Öström');

    expect(payload.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          or: [
            { deployment: { equals: 'asa-ostrom' } },
            { slug: { equals: 'asa-ostrom' } }
          ]
        }
      })
    );
  });

  it('says a taken address is not, and why', async () => {
    payload.count.mockResolvedValue({ totalDocs: 1 });

    const response = await get('ada engines');

    expect(await response.json()).toEqual({
      available: false,
      reason: 'address'
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('says a name that differs only by case is taken', async () => {
    answer({ signupOpen: true }, ['ADA Engines']);

    const response = await get('Ada Engines');

    expect(await response.json()).toEqual({
      available: false,
      reason: 'name'
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('throttles an address that asks too often', async () => {
    for (let i = 0; i < AVAILABLE_RATE_LIMIT; i++) {
      expect((await get('Ada Engines')).status).toBe(200);
    }

    const response = await get('Ada Engines');

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'throttled' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(payload.count).toHaveBeenCalledTimes(AVAILABLE_RATE_LIMIT);
  });
});

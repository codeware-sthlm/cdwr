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

const get = (deployment?: string) =>
  GET(
    new NextRequest(
      `https://cms.example/api/signup/available${
        deployment === undefined ? '' : `?deployment=${deployment}`
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
  payload.find.mockResolvedValue({ docs: [{ signupOpen: true }] });
});

describe('GET /api/signup/available', () => {
  it('is not found in tenant mode, and does nothing', async () => {
    jest
      .mocked(getEnv)
      .mockReturnValue({ APP_MODE: { type: 'tenant' } } as ReturnType<
        typeof getEnv
      >);

    const response = await get('ada-engines');

    expect(response.status).toBe(404);
    expect(getPayload).not.toHaveBeenCalled();
  });

  it('answers a malformed address without touching the database', async () => {
    const response = await get('Not Valid!');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      available: false,
      issue: 'characters'
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(getPayload).not.toHaveBeenCalled();
  });

  it('answers a missing address as empty', async () => {
    const response = await get();

    expect(await response.json()).toEqual({ available: false, issue: 'empty' });
  });

  it('is not found while signup is closed, before any lookup', async () => {
    payload.find.mockResolvedValue({ docs: [{ signupOpen: false }] });

    const response = await get('ada-engines');

    expect(response.status).toBe(404);
    expect(payload.count).not.toHaveBeenCalled();
  });

  it('says a free address is available', async () => {
    const response = await get('ada-engines');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('says a taken address is not', async () => {
    payload.count.mockResolvedValue({ totalDocs: 1 });

    const response = await get('ada-engines');

    expect(await response.json()).toEqual({ available: false });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('throttles an address that asks too often', async () => {
    for (let i = 0; i < AVAILABLE_RATE_LIMIT; i++) {
      expect((await get('ada-engines')).status).toBe(200);
    }

    const response = await get('ada-engines');

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'throttled' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(payload.count).toHaveBeenCalledTimes(AVAILABLE_RATE_LIMIT);
  });
});

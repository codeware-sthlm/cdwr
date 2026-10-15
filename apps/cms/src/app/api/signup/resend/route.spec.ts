/** @jest-environment node */
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { sendPlatformMail } from '@codeware/app-cms/util/email';
import { rateLimit } from '@codeware/shared/util/human-check';
import { NextRequest, NextResponse } from 'next/server';
import { getPayload } from 'payload';

import { refuseUnlessHuman } from '../../../../security/public-submit';

import { POST } from './route';

// ESM-only packages the data-access barrel pulls in
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));
jest.mock('@payloadcms/db-postgres', () => ({ sql: jest.fn() }));
jest.mock('@payloadcms/email-nodemailer', () => ({
  nodemailerAdapter: jest.fn()
}));
// The real error class is ESM-only; the route does not need it
jest.mock('payload', () => ({
  getPayload: jest.fn(),
  ValidationError: class ValidationError extends Error {}
}));
jest.mock('@codeware/app-cms/feature/env-loader', () => ({
  getEnv: jest.fn()
}));
jest.mock('@codeware/app-cms/util/email', () => ({
  ...jest.requireActual('@codeware/app-cms/util/email'),
  sendPlatformMail: jest.fn()
}));
jest.mock('@codeware/shared/util/human-check', () => ({
  ...jest.requireActual('@codeware/shared/util/human-check'),
  rateLimit: jest.fn()
}));
jest.mock('../../../../security/public-submit', () => ({
  refuseUnlessHuman: jest.fn()
}));
jest.mock('../../../../payload.config', () => ({}));

const body = {
  email: 'Ada@Example.com',
  locale: 'sv',
  humanCheck: { token: 't', honeypot: '', elapsedMs: 5000 }
};

const payload = {
  find: jest.fn(),
  logger: { error: jest.fn(), info: jest.fn() },
  config: { serverURL: 'https://cms.example/', routes: { admin: '/admin' } }
};

const post = (data: unknown = body, raw?: string) =>
  POST(
    new NextRequest('https://cms.example/api/signup/resend', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.7' },
      body: raw ?? JSON.stringify(data)
    })
  );

/** Let the fire-and-forget lookup and mail settle */
const flush = () => new Promise((resolve) => setImmediate(resolve));

const findResult = (user?: Record<string, unknown>) =>
  payload.find.mockResolvedValue({ docs: user ? [user] : [] });

beforeEach(() => {
  jest.resetAllMocks();
  jest
    .mocked(getEnv)
    .mockReturnValue({ APP_MODE: { type: 'host' } } as ReturnType<
      typeof getEnv
    >);
  jest.mocked(refuseUnlessHuman).mockResolvedValue(null);
  jest
    .mocked(rateLimit)
    .mockReturnValue({ ok: true } as ReturnType<typeof rateLimit>);
  jest.mocked(getPayload).mockResolvedValue(payload as never);
  jest.mocked(sendPlatformMail).mockResolvedValue(undefined as never);
  findResult();
});

describe('POST /api/signup/resend', () => {
  it('is not found in tenant mode, and does nothing', async () => {
    jest
      .mocked(getEnv)
      .mockReturnValue({ APP_MODE: { type: 'tenant' } } as ReturnType<
        typeof getEnv
      >);

    const response = await post();

    expect(response.status).toBe(404);
    expect(refuseUnlessHuman).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
    expect(getPayload).not.toHaveBeenCalled();
  });

  it('refuses a body that is not JSON', async () => {
    const response = await post(undefined, 'not json');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid' });
    expect(refuseUnlessHuman).not.toHaveBeenCalled();
  });

  it.each(['null', '[]', '"text"'])(
    'refuses a JSON body that is not an object (%s)',
    async (raw) => {
      const response = await post(undefined, raw);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid' });
      expect(refuseUnlessHuman).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['missing', undefined],
    ['not a string', 42],
    ['empty', '   '],
    ['no at sign', 'ada.example.com'],
    ['no domain dot', 'ada@example'],
    ['with whitespace', 'ada lovelace@example.com'],
    ['too long', `${'a'.repeat(250)}@example.com`]
  ])('refuses an email that is %s', async (_name, email) => {
    const response = await post({ ...body, email });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid' });
    expect(refuseUnlessHuman).not.toHaveBeenCalled();
    expect(getPayload).not.toHaveBeenCalled();
  });

  it('passes a human check refusal through', async () => {
    jest
      .mocked(refuseUnlessHuman)
      .mockResolvedValue(
        NextResponse.json({ error: 'Slow down' }, { status: 429 })
      );

    const response = await post();

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'Slow down' });
    expect(rateLimit).not.toHaveBeenCalled();
    expect(getPayload).not.toHaveBeenCalled();
  });

  it('answers the same without looking up when over the per-email limit', async () => {
    jest
      .mocked(rateLimit)
      .mockReturnValue({ ok: false } as ReturnType<typeof rateLimit>);

    const response = await post();
    await flush();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(rateLimit).toHaveBeenCalledWith(
      'resend:ada@example.com',
      expect.objectContaining({ limit: 3 })
    );
    expect(payload.find).not.toHaveBeenCalled();
    expect(sendPlatformMail).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown email', undefined],
    ['a verified user', { _verified: true, _verificationToken: 'tok' }],
    ['an unverified user without a token', { _verified: false }]
  ])('sends no mail for %s', async (_name, user) => {
    findResult(user);

    const response = await post();
    await flush();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(payload.find).toHaveBeenCalledTimes(1);
    expect(sendPlatformMail).not.toHaveBeenCalled();
  });

  it('mails the stored link again to an unverified user', async () => {
    findResult({
      _verified: false,
      _verificationToken: 'verify-token',
      name: 'Ada Lovelace'
    });

    const response = await post();
    await flush();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        where: { email: { equals: 'ada@example.com' } },
        showHiddenFields: true,
        overrideAccess: true
      })
    );
    expect(sendPlatformMail).toHaveBeenCalledTimes(1);
    const [, options] = jest.mocked(sendPlatformMail).mock.calls[0];
    expect(options.to).toBe('ada@example.com');
    expect(options.label).toBe('verify again');
    expect(options.mail.text).toContain(
      'https://cms.example/admin/users/verify/verify-token'
    );
  });

  it('gives the same answer whether or not a mail was needed', async () => {
    const answers: Array<{ status: number; text: string }> = [];
    for (const user of [
      undefined,
      { _verified: true, _verificationToken: 'tok' },
      { _verified: false, _verificationToken: 'verify-token', name: 'Ada' }
    ]) {
      findResult(user);
      const response = await post();
      await flush();
      answers.push({ status: response.status, text: await response.text() });
    }

    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
  });

  it('keeps the answer and logs when the lookup fails', async () => {
    payload.find.mockRejectedValue(new Error('db down'));

    const response = await post();
    await flush();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(payload.logger.error).toHaveBeenCalled();
    expect(sendPlatformMail).not.toHaveBeenCalled();
  });
});

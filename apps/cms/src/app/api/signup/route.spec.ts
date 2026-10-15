/** @jest-environment node */
import {
  InviteCodeRefused,
  consumeInviteCode
} from '@codeware/app-cms/data-access';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  sendPlatformMail,
  sendSignupEmails
} from '@codeware/app-cms/util/email';
import { NextRequest, NextResponse } from 'next/server';
import { ValidationError, getPayload } from 'payload';

import { refuseUnlessHuman } from '../../../security/public-submit';

import { POST } from './route';

// ESM-only packages the data-access barrel pulls in
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));
jest.mock('@payloadcms/db-postgres', () => ({ sql: jest.fn() }));
jest.mock('@payloadcms/email-nodemailer', () => ({
  nodemailerAdapter: jest.fn()
}));
// The real error class is ESM-only; this one keeps what `signupRefusal` reads
jest.mock('payload', () => ({
  getPayload: jest.fn(),
  ValidationError: class ValidationError extends Error {
    data: { errors: Array<{ path: string }> };
    constructor(results: { errors: Array<{ path: string }> }) {
      super('ValidationError');
      this.data = results;
    }
  }
}));
jest.mock('@codeware/app-cms/data-access', () => ({
  ...jest.requireActual('@codeware/app-cms/data-access'),
  consumeInviteCode: jest.fn()
}));
jest.mock('@codeware/app-cms/feature/env-loader', () => ({
  getEnv: jest.fn()
}));
jest.mock('@codeware/app-cms/util/email', () => ({
  ...jest.requireActual('@codeware/app-cms/util/email'),
  sendSignupEmails: jest.fn(),
  sendPlatformMail: jest.fn()
}));
jest.mock('../../../security/public-submit', () => ({
  refuseUnlessHuman: jest.fn()
}));
jest.mock('../../../payload.config', () => ({}));

const TRANSACTION = 'tx-1';

const body = {
  code: 'abcd-efgh',
  name: 'Ada Lovelace',
  email: 'Ada@Example.com',
  password: 'correct horse battery',
  siteName: 'Ada Engines',
  deployment: 'ada-engines',
  locale: 'sv',
  humanCheck: { token: 't', honeypot: '', elapsedMs: 5000 }
};

const payload = {
  db: {
    beginTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn()
  },
  count: jest.fn(),
  create: jest.fn(),
  find: jest.fn(),
  findByID: jest.fn(),
  logger: { error: jest.fn(), info: jest.fn() },
  config: { serverURL: 'https://cms.example/', routes: { admin: '/admin' } }
};

// Mails are sent after the response, so let them settle before asserting
const flush = () => new Promise((resolve) => setImmediate(resolve));

const post = (data: unknown = body, raw?: string) =>
  POST(
    new NextRequest('https://cms.example/api/signup', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.7' },
      body: raw ?? JSON.stringify(data)
    })
  );

const unique = (path: string) =>
  new ValidationError({
    collection: 'tenants',
    errors: [{ path, message: 'Value must be unique' }]
  });

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getEnv).mockReturnValue({
    APP_MODE: { type: 'host' },
    DEPLOY_ENV: 'production'
  } as ReturnType<typeof getEnv>);
  jest.mocked(refuseUnlessHuman).mockResolvedValue(null);
  jest.mocked(getPayload).mockResolvedValue(payload as never);
  jest.mocked(consumeInviteCode).mockResolvedValue(undefined as never);
  payload.db.beginTransaction.mockResolvedValue(TRANSACTION);
  payload.count.mockResolvedValue({ totalDocs: 0 });
  payload.create.mockImplementation(async ({ collection }) =>
    collection === 'tenants' ? { id: 11 } : { id: 21 }
  );
  payload.findByID.mockResolvedValue({ _verificationToken: 'verify-token' });
  payload.find.mockResolvedValue({
    docs: [{ signupNotifyEmail: 'owner@example.com' }]
  });
  jest.mocked(sendSignupEmails).mockResolvedValue(undefined);
});

describe('POST /api/signup', () => {
  it('is not found in tenant mode, and does nothing', async () => {
    jest
      .mocked(getEnv)
      .mockReturnValue({ APP_MODE: { type: 'tenant' } } as ReturnType<
        typeof getEnv
      >);

    const response = await post();

    expect(response.status).toBe(404);
    expect(refuseUnlessHuman).not.toHaveBeenCalled();
    expect(getPayload).not.toHaveBeenCalled();
    expect(consumeInviteCode).not.toHaveBeenCalled();
  });

  it('refuses a body that is not JSON', async () => {
    const response = await post(undefined, 'not json');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid' });
    expect(consumeInviteCode).not.toHaveBeenCalled();
  });

  it.each(['null', '[]', '"text"'])(
    'refuses a JSON body that is not an object (%s)',
    async (raw) => {
      const response = await post(undefined, raw);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid' });
      expect(consumeInviteCode).not.toHaveBeenCalled();
    }
  );

  it('refuses input that does not parse', async () => {
    const response = await post({ ...body, password: 'short' });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'password' });
    expect(payload.db.beginTransaction).not.toHaveBeenCalled();
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
    expect(payload.db.beginTransaction).not.toHaveBeenCalled();
  });

  it('creates a pending tenant and its first user, then mails', async () => {
    const response = await post();

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });

    expect(consumeInviteCode).toHaveBeenCalledWith(payload, 'abcd-efgh', {
      transactionID: TRANSACTION,
      attemptsKey: '203.0.113.7:invite-code'
    });

    expect(payload.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        collection: 'tenants',
        data: {
          name: 'Ada Engines',
          slug: 'ada-engines',
          supportedLocales: ['sv'],
          deployment: 'ada-engines',
          status: 'pending'
        },
        req: { transactionID: TRANSACTION }
      })
    );
    expect(payload.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        collection: 'users',
        data: {
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          password: body.password,
          role: 'user',
          tenants: [{ tenant: 11, role: 'admin' }]
        },
        context: { signup: true },
        disableVerificationEmail: true,
        req: { transactionID: TRANSACTION }
      })
    );

    expect(payload.db.commitTransaction).toHaveBeenCalledWith(TRANSACTION);
    expect(payload.db.rollbackTransaction).not.toHaveBeenCalled();
    // Mails go out only once the signup is committed
    await flush();
    expect(
      payload.db.commitTransaction.mock.invocationCallOrder[0]
    ).toBeLessThan(jest.mocked(sendSignupEmails).mock.invocationCallOrder[0]);

    expect(sendSignupEmails).toHaveBeenCalledTimes(1);
    const [, mails] = jest.mocked(sendSignupEmails).mock.calls[0];
    expect(mails.verify.to).toBe('ada@example.com');
    expect(mails.verify.mail.text).toContain(
      'https://cms.example/admin/users/verify/verify-token'
    );
    expect(mails.notice?.to).toBe('owner@example.com');
    expect(mails.notice?.mail.text).toContain(
      'https://cms.example/admin/collections/tenants/11'
    );
    expect(mails.notice?.mail.text).toContain(
      'cdwr tenant provision --env production --workspace'
    );
  });

  it('sends no notice when no address is set', async () => {
    payload.find.mockResolvedValue({ docs: [{ signupNotifyEmail: null }] });

    const response = await post();

    expect(response.status).toBe(201);
    await flush();
    const [, mails] = jest.mocked(sendSignupEmails).mock.calls[0];
    expect(mails.verify.to).toBe('ada@example.com');
    expect(mails.notice).toBeUndefined();
  });

  it('refuses a rejected invite code and leaves nothing behind', async () => {
    jest
      .mocked(consumeInviteCode)
      .mockRejectedValue(new InviteCodeRefused('expired'));

    const response = await post();

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'code' });
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.db.rollbackTransaction).toHaveBeenCalledWith(TRANSACTION);
    expect(payload.db.commitTransaction).not.toHaveBeenCalled();
    await flush();
    expect(sendSignupEmails).not.toHaveBeenCalled();
  });

  it('answers a throttled invite code check with 429', async () => {
    jest
      .mocked(consumeInviteCode)
      .mockRejectedValue(new InviteCodeRefused('throttled'));

    const response = await post();

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'throttled' });
    await flush();
    expect(sendSignupEmails).not.toHaveBeenCalled();
  });

  it('answers a taken deployment with 409 and rolls back', async () => {
    payload.create.mockRejectedValue(unique('deployment'));

    const response = await post();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'deployment-taken' });
    expect(payload.db.rollbackTransaction).toHaveBeenCalledWith(TRANSACTION);
    expect(payload.db.commitTransaction).not.toHaveBeenCalled();
    await flush();
    expect(sendSignupEmails).not.toHaveBeenCalled();
  });

  it('refuses an address an existing workspace answers to, before creating', async () => {
    payload.count.mockResolvedValue({ totalDocs: 1 });

    const response = await post();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'deployment-taken' });
    expect(payload.count).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'tenants',
        where: {
          or: [
            { deployment: { equals: body.deployment } },
            { slug: { equals: body.deployment } }
          ]
        }
      })
    );
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.db.rollbackTransaction).toHaveBeenCalledWith(TRANSACTION);
  });

  it('answers a taken site address with an existing email as taken, never reaching the user insert', async () => {
    payload.count.mockResolvedValue({ totalDocs: 1 });
    payload.create.mockRejectedValue(unique('email'));

    const response = await post();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'deployment-taken' });
    expect(payload.create).not.toHaveBeenCalled();
    expect(consumeInviteCode).toHaveBeenCalledTimes(1);
  });

  it('answers a taken email like a success, rolls back and spends the code on its own', async () => {
    payload.db.beginTransaction
      .mockResolvedValueOnce('tx-1')
      .mockResolvedValueOnce('tx-2');
    payload.create
      .mockResolvedValueOnce({ id: 11 })
      .mockRejectedValueOnce(unique('email'));

    const response = await post();

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(consumeInviteCode).toHaveBeenCalledTimes(2);
    expect(consumeInviteCode).toHaveBeenNthCalledWith(
      1,
      payload,
      'abcd-efgh',
      expect.objectContaining({ transactionID: 'tx-1' })
    );
    expect(consumeInviteCode).toHaveBeenNthCalledWith(
      2,
      payload,
      'abcd-efgh',
      expect.objectContaining({ transactionID: 'tx-2' })
    );
    // The workspace is undone, the spent code is committed on its own
    expect(payload.db.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(payload.db.rollbackTransaction).toHaveBeenCalledWith('tx-1');
    expect(payload.db.commitTransaction).toHaveBeenCalledTimes(1);
    expect(payload.db.commitTransaction).toHaveBeenCalledWith('tx-2');

    await flush();
    expect(sendSignupEmails).not.toHaveBeenCalled();
    expect(sendPlatformMail).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({
        to: body.email.toLowerCase(),
        label: 'account exists'
      })
    );
  });

  it('answers an unexpected failure with 500 and logs it', async () => {
    payload.create.mockRejectedValue(new Error('boom'));

    const response = await post();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'failed' });
    expect(payload.db.rollbackTransaction).toHaveBeenCalledWith(TRANSACTION);
    expect(payload.logger.error).toHaveBeenCalled();
  });

  it('keeps the 201 when the mails fail', async () => {
    jest.mocked(sendSignupEmails).mockRejectedValue(new Error('smtp down'));

    const response = await post();

    expect(response.status).toBe(201);
    await flush();
    expect(payload.db.commitTransaction).toHaveBeenCalled();
    expect(payload.logger.error).toHaveBeenCalled();
  });
});

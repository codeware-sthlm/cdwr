/** @jest-environment node */
import type { CollectionAfterChangeHook } from 'payload';

import { mailVerificationAfterCreateHook } from './mail-verification-after-create.hook';

// ESM-only packages the email barrel pulls in
jest.mock('@payloadcms/email-nodemailer', () => ({
  nodemailerAdapter: jest.fn()
}));

type HookArgs = Parameters<CollectionAfterChangeHook>[0];

const payload = {
  config: { serverURL: 'https://cms.example', routes: { admin: '/admin' } },
  findByID: jest.fn(),
  sendEmail: jest.fn(),
  logger: { error: jest.fn() }
};

const doc = { id: 5, name: 'Ada', email: 'ada@example.com' };

const run = (
  operation: string,
  context: Record<string, unknown> = { mailVerification: true }
) =>
  mailVerificationAfterCreateHook({
    doc,
    operation,
    req: { context, payload, i18n: { language: 'en' } }
  } as unknown as HookArgs);

// The mail is sent without being awaited
const flush = () => new Promise((resolve) => setImmediate(resolve));

// The link depends on the app mode, which a developer's .env.local may set
const tenantId = process.env['TENANT_ID'];
afterAll(() => {
  if (tenantId === undefined) delete process.env['TENANT_ID'];
  else process.env['TENANT_ID'] = tenantId;
});

beforeEach(() => {
  delete process.env['TENANT_ID'];
  jest.resetAllMocks();
  payload.findByID.mockResolvedValue({ _verificationToken: 'verify-token' });
  payload.sendEmail.mockResolvedValue(undefined);
});

describe('mailVerificationAfterCreateHook', () => {
  it('mails the new user a verification link when flagged', async () => {
    expect(run('create')).toBe(doc);
    await flush();

    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        id: 5,
        showHiddenFields: true,
        overrideAccess: true
      })
    );
    expect(payload.sendEmail).toHaveBeenCalledTimes(1);
    const [mail] = payload.sendEmail.mock.calls[0];
    expect(mail.to).toBe('ada@example.com');
    expect(mail.text).toContain('/signup/verify/verify-token');
    expect(mail.html).toContain('/signup/verify/verify-token');
  });

  it('keeps the admin verify link in tenant mode, which has no signup pages', async () => {
    process.env['TENANT_ID'] = 'moon';
    run('create');
    await flush();

    const [mail] = payload.sendEmail.mock.calls[0];
    expect(mail.text).toContain('/admin/users/verify/verify-token');
  });

  it('sends nothing when not flagged', async () => {
    expect(run('create', {})).toBe(doc);
    await flush();

    expect(payload.findByID).not.toHaveBeenCalled();
    expect(payload.sendEmail).not.toHaveBeenCalled();
  });

  it('sends nothing on update', async () => {
    expect(run('update')).toBe(doc);
    await flush();

    expect(payload.sendEmail).not.toHaveBeenCalled();
  });

  it('sends nothing when the user has no token', async () => {
    payload.findByID.mockResolvedValue({ _verificationToken: null });

    expect(run('create')).toBe(doc);
    await flush();

    expect(payload.sendEmail).not.toHaveBeenCalled();
    expect(payload.logger.error).not.toHaveBeenCalled();
  });

  it('logs a mail that fails and does not throw', async () => {
    payload.sendEmail.mockRejectedValue(new Error('smtp down'));

    expect(run('create')).toBe(doc);
    await flush();

    expect(payload.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('smtp down')
    );
  });

  it('logs a failed read-back and does not throw', async () => {
    payload.findByID.mockRejectedValue(new Error('db down'));

    expect(run('create')).toBe(doc);
    await flush();

    expect(payload.sendEmail).not.toHaveBeenCalled();
    expect(payload.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('db down')
    );
  });
});

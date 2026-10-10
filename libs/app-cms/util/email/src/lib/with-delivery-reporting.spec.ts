import * as Sentry from '@sentry/nextjs';
import type { EmailAdapter } from 'payload';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withDeliveryReporting } from './with-delivery-reporting';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

const logger = { error: vi.fn() };
const payload = { logger } as unknown as Parameters<EmailAdapter>[0]['payload'];

/** A minimal adapter, its `sendEmail` swappable per test */
const fakeAdapter =
  (sendEmail: EmailAdapter['sendEmail']): EmailAdapter =>
  () => ({
    name: 'fake',
    defaultFromAddress: 'no-reply@codeware.se',
    defaultFromName: 'Codeware',
    sendEmail
  });

const message = { to: 'cloud@codeware.se', subject: 'New message' };

describe('withDeliveryReporting', () => {
  beforeEach(() => {
    logger.error.mockClear();
    vi.mocked(Sentry.captureException).mockClear();
  });

  it('passes a successful send through untouched', async () => {
    const sendEmail = vi.fn().mockResolvedValue({ id: 'sent' });
    const factory = await Promise.resolve(
      withDeliveryReporting(fakeAdapter(sendEmail))
    );

    const adapter = factory({ payload });
    await expect(adapter.sendEmail(message)).resolves.toEqual({ id: 'sent' });
    expect(logger.error).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('logs, reports to Sentry, and rethrows on a failed send', async () => {
    const err = new Error('Bad Request');
    const sendEmail = vi.fn().mockRejectedValue(err);
    const factory = await Promise.resolve(
      withDeliveryReporting(fakeAdapter(sendEmail))
    );

    const adapter = factory({ payload });
    await expect(adapter.sendEmail(message)).rejects.toBe(err);

    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err }));
    expect(Sentry.captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ tags: { emailTransport: 'fake' } })
    );
  });

  it('redacts recipients and subject, keeping the domain', async () => {
    const err = new Error('Bad Request');
    const sendEmail = vi.fn().mockRejectedValue(err);
    const factory = await Promise.resolve(
      withDeliveryReporting(fakeAdapter(sendEmail))
    );

    const adapter = factory({ payload });
    await expect(
      adapter.sendEmail({
        to: 'anna.berg@example.se',
        // A form's notification subject is a template, so the visitor's own
        // address routinely ends up in it
        subject: 'New message from visitor@gmail.com'
      })
    ).rejects.toBe(err);

    const [[logged]] = logger.error.mock.calls;
    expect(logged.msg).toContain('***@example.se');
    expect(logged.msg).toContain('***@gmail.com');
    expect(logged.msg).not.toContain('anna.berg');
    expect(logged.msg).not.toContain('visitor@');

    const [, context] = vi.mocked(Sentry.captureException).mock.calls[0];
    expect(context).toMatchObject({
      extra: {
        to: '***@example.se',
        subject: 'New message from ***@gmail.com',
        recipientCount: 1
      }
    });
  });

  it('counts every recipient of a batch, in either shape', async () => {
    const err = new Error('down');
    const factory = await Promise.resolve(
      withDeliveryReporting(fakeAdapter(vi.fn().mockRejectedValue(err)))
    );

    await expect(
      factory({ payload }).sendEmail({
        to: ['one@example.se', { address: 'two@example.se', name: 'Two' }],
        subject: 'Batch'
      })
    ).rejects.toBe(err);

    const [, context] = vi.mocked(Sentry.captureException).mock.calls[0];
    expect(context).toMatchObject({
      extra: { to: '***@example.se, ***@example.se', recipientCount: 2 }
    });
  });

  it('counts recipients in nested lists', async () => {
    const err = new Error('down');
    const factory = await Promise.resolve(
      withDeliveryReporting(fakeAdapter(vi.fn().mockRejectedValue(err)))
    );

    await expect(
      factory({ payload }).sendEmail({
        to: [['one@example.se', { address: 'two@example.se' }], 'three@ex.se'],
        subject: 'Nested'
      })
    ).rejects.toBe(err);

    const [, context] = vi.mocked(Sentry.captureException).mock.calls[0];
    expect(context).toMatchObject({ extra: { recipientCount: 3 } });
  });

  it('preserves the adapter identity fields', async () => {
    const factory = await Promise.resolve(
      withDeliveryReporting(fakeAdapter(vi.fn()))
    );
    const adapter = factory({ payload });

    expect(adapter).toMatchObject({
      name: 'fake',
      defaultFromAddress: 'no-reply@codeware.se',
      defaultFromName: 'Codeware'
    });
  });

  it('wraps an adapter that resolves asynchronously', async () => {
    const err = new Error('down');
    const sendEmail = vi.fn().mockRejectedValue(err);
    const asyncAdapter = Promise.resolve(fakeAdapter(sendEmail));

    const factory = await Promise.resolve(withDeliveryReporting(asyncAdapter));
    const adapter = factory({ payload });

    await expect(adapter.sendEmail(message)).rejects.toBe(err);
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

import type { Payload } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { sendPlatformMail, sendSignupEmails } from './send-signup-emails';

const mail = (subject: string) => ({ subject, html: '<p>x</p>', text: 'x' });

const input = {
  verify: { to: 'anna@example.com', mail: mail('Confirm') },
  notice: { to: 'owner@example.com', mail: mail('Notice') }
};

const makePayload = (sendEmail: ReturnType<typeof vi.fn>) => {
  const error = vi.fn();
  const payload = { sendEmail, logger: { error } } as unknown as Payload;
  return { payload, error };
};

describe('sendSignupEmails', () => {
  it('sends the verify mail and the notice', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    const { payload } = makePayload(sendEmail);

    await sendSignupEmails(payload, input);

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'anna@example.com', subject: 'Confirm' })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@example.com', subject: 'Notice' })
    );
  });

  it('skips the notice when none is given', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    const { payload } = makePayload(sendEmail);

    await sendSignupEmails(payload, { verify: input.verify });

    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('never throws and logs which mail failed', async () => {
    const sendEmail = vi.fn().mockRejectedValue(new Error('smtp down'));
    const { payload, error } = makePayload(sendEmail);

    await expect(sendSignupEmails(payload, input)).resolves.toBeUndefined();

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(2);
    expect(error.mock.calls[0][0]).toContain('verify');
    expect(error.mock.calls[1][0]).toContain('notice');
  });
});

describe('sendPlatformMail', () => {
  it('sends the mail', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    const { payload } = makePayload(sendEmail);

    await sendPlatformMail(payload, {
      to: 'anna@example.com',
      mail: mail('Exists'),
      label: 'account-exists'
    });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'anna@example.com', subject: 'Exists' })
    );
  });

  it('never throws and logs the label', async () => {
    const sendEmail = vi.fn().mockRejectedValue(new Error('smtp down'));
    const { payload, error } = makePayload(sendEmail);

    await expect(
      sendPlatformMail(payload, {
        to: 'anna@example.com',
        mail: mail('Exists'),
        label: 'account-exists'
      })
    ).resolves.toBe(false);

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(
        '[signupEmails] Could not send the account-exists mail: Error: smtp down'
      )
    );
  });
});

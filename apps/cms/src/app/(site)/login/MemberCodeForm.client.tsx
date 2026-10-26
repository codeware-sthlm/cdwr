'use client';

import { useState } from 'react';

type Props = {
  /** Where to go once the code is accepted, already resolved to this site */
  returnTo: string;
  /** Where `payload-totp` verifies the code */
  verifyPath: string;
  labels: { code: string; submit: string; failed: string };
};

/**
 * The second step of a member sign-in: the code from an authenticator app.
 *
 * `payload-totp` verifies it and sets the cookie that upgrades the session,
 * and wants JSON, so this is the one part of the sign-in that needs script.
 * Wrong codes count towards the account's lockout there, not here.
 */
export function MemberCodeForm({ returnTo, verifyPath, labels }: Props) {
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = String(new FormData(event.currentTarget).get('code') ?? '');

    setSending(true);
    setFailed(false);
    try {
      const response = await fetch(verifyPath, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
      } | null;

      if (result?.ok) {
        // A full load, so the page renders with the verified session
        window.location.assign(returnTo);
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        {labels.code}
        <input
          type="text"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={8}
          required
          autoFocus
          className="border-input bg-background rounded-md border px-3 py-2"
        />
      </label>

      <button
        type="submit"
        disabled={sending}
        className="bg-primary text-primary-foreground rounded-md px-4 py-2 font-medium"
      >
        {labels.submit}
      </button>

      {failed ? (
        <p role="alert" className="text-destructive text-sm">
          {labels.failed}
        </p>
      ) : null}
    </form>
  );
}

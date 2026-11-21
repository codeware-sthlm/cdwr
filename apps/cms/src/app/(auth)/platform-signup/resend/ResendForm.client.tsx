'use client';
import { type AuthFormStatus, ResendFormView } from '@codeware/app-cms/ui/auth';
import { useHumanCheck } from '@codeware/shared/ui/cms-renderer';
import { type SupportedLocale, t } from '@codeware/shared/util/i18n';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { type FormEvent, useRef, useState } from 'react';

type Props = {
  locale: SupportedLocale;
  /** Turnstile's site key; without one no widget is drawn */
  siteKey?: string;
};

type Outcome = 'done' | 'throttled' | 'failed';

/**
 * Asks for the confirmation mail again.
 *
 * Every answer but a throttle or a network failure reads the same, so the page
 * never says whether the address has an account.
 */
export function ResendForm({ locale, siteKey }: Props) {
  const { theme } = useTheme();
  const humanCheck = useHumanCheck({
    colorScheme:
      theme === 'light' || theme === 'dark' || theme === 'system'
        ? theme
        : undefined,
    locale,
    siteKey
  });

  const [email, setEmail] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [sending, setSending] = useState(false);
  // Set on the press itself, since state lags a second press of Enter
  const submitting = useRef(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || !humanCheck.solved) {
      return;
    }

    submitting.current = true;
    setSending(true);
    setOutcome(null);

    try {
      const response = await fetch('/api/signup/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          locale,
          humanCheck: humanCheck.proof()
        })
      });

      setOutcome(response.status === 429 ? 'throttled' : 'done');
    } catch {
      setOutcome('failed');
    } finally {
      // The token is spent whatever the answer was
      humanCheck.reset();
      submitting.current = false;
      setSending(false);
    }
  };

  const status: AuthFormStatus =
    outcome === 'done'
      ? 'sent'
      : sending
        ? 'submitting'
        : outcome
          ? 'refused'
          : 'idle';

  return (
    <ResendFormView
      labels={{
        title: t(locale, 'signup.resend.title'),
        intro: t(locale, 'signup.resend.intro'),
        email: t(locale, 'signup.email'),
        submit: t(locale, 'signup.resend.submit'),
        submitting: t(locale, 'signup.resend.submitting'),
        done: t(locale, 'signup.resend.done')
      }}
      email={email}
      status={status}
      refusal={
        outcome && outcome !== 'done'
          ? t(
              locale,
              outcome === 'throttled'
                ? 'signup.error.throttled'
                : 'signup.error.failed'
            )
          : null
      }
      canSubmit={humanCheck.solved}
      humanCheck={humanCheck.fields}
      footer={
        <Link href="/admin/login">{t(locale, 'signup.backToLogin')}</Link>
      }
      onChange={setEmail}
      onSubmit={onSubmit}
    />
  );
}

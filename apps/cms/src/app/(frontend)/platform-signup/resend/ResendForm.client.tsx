'use client';
import { useHumanCheck } from '@codeware/shared/ui/cms-renderer';
import { Alert } from '@codeware/shared/ui/shadcn/components/alert';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@codeware/shared/ui/shadcn/components/card';
import { Input } from '@codeware/shared/ui/shadcn/components/input';
import { Label } from '@codeware/shared/ui/shadcn/components/label';
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

  if (outcome === 'done') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t(locale, 'signup.resend.title')}</CardTitle>
          <CardDescription>{t(locale, 'signup.resend.done')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/admin/login" className="text-sm underline">
            {t(locale, 'signup.backToLogin')}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">
          {t(locale, 'signup.resend.title')}
        </CardTitle>
        <CardDescription>{t(locale, 'signup.resend.intro')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {outcome && (
            <Alert variant="destructive">
              {t(
                locale,
                outcome === 'throttled'
                  ? 'signup.error.throttled'
                  : 'signup.error.failed'
              )}
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="resend-email">{t(locale, 'signup.email')}</Label>
            <Input
              id="resend-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>

          {humanCheck.fields}

          <Button type="submit" disabled={sending || !humanCheck.solved}>
            {sending
              ? t(locale, 'signup.resend.submitting')
              : t(locale, 'signup.resend.submit')}
          </Button>

          <Link href="/admin/login" className="text-sm underline">
            {t(locale, 'signup.backToLogin')}
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}

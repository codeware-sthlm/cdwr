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
import {
  deploymentNameIssue,
  toDeploymentName
} from '@codeware/shared/util/pure';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { type FormEvent, useRef, useState } from 'react';

import type { SignupRefusal } from '../../../utils/signup';

type Props = {
  locale: SupportedLocale;
  /** Turnstile's site key; without one no widget is drawn */
  siteKey?: string;
};

type Field = 'password' | 'email' | 'siteName' | 'deployment';

/** Refusals worded next to the field they are about; the rest sit above the form */
const REFUSAL_FIELD: Partial<Record<SignupRefusal, Field>> = {
  password: 'password',
  'email-taken': 'email',
  'name-taken': 'siteName',
  deployment: 'deployment',
  'deployment-taken': 'deployment'
};

const isRefusal = (value: unknown): value is SignupRefusal =>
  typeof value === 'string' &&
  [
    'invalid',
    'password',
    'deployment',
    'code',
    'closed',
    'throttled',
    'email-taken',
    'deployment-taken',
    'name-taken',
    'failed'
  ].includes(value);

/** What the server answered a refused signup with, as a refusal we can word */
async function readRefusal(response: Response): Promise<SignupRefusal> {
  const body: unknown = await response.json().catch(() => null);
  const error =
    body && typeof body === 'object' && 'error' in body ? body.error : null;
  if (isRefusal(error)) {
    return error;
  }
  // The human check answers 429 with words of its own
  return response.status === 429 ? 'throttled' : 'failed';
}

/** The signup form, which turns an invite code into a pending site */
export function SignupForm({ locale, siteKey }: Props) {
  const { theme } = useTheme();
  const humanCheck = useHumanCheck({
    colorScheme:
      theme === 'light' || theme === 'dark' || theme === 'system'
        ? theme
        : undefined,
    locale,
    siteKey
  });

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [siteName, setSiteName] = useState('');
  // Null until the person edits the address; until then it follows the name
  const [editedDeployment, setEditedDeployment] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<SignupRefusal | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  // Set on the press itself, since state lags a second press of Enter
  const submitting = useRef(false);

  const deployment = editedDeployment ?? toDeploymentName(siteName);
  const issue =
    deployment === '' && editedDeployment === null
      ? null
      : deploymentNameIssue(deployment);

  const refusedField = refusal ? REFUSAL_FIELD[refusal] : undefined;
  const refusalMessage = refusal ? t(locale, `signup.error.${refusal}`) : null;
  const fieldError = (field: Field) =>
    refusedField === field ? refusalMessage : null;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || !humanCheck.solved || issue !== null) {
      return;
    }

    submitting.current = true;
    setSending(true);
    setRefusal(null);

    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          name,
          email,
          password,
          siteName,
          deployment,
          locale,
          humanCheck: humanCheck.proof()
        })
      });

      if (response.status === 201) {
        setDone(true);
        return;
      }

      setRefusal(await readRefusal(response));
    } catch {
      setRefusal('failed');
    } finally {
      // The token is spent whatever the answer was
      humanCheck.reset();
      submitting.current = false;
      setSending(false);
    }
  };

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t(locale, 'signup.successTitle')}</CardTitle>
          <CardDescription>{t(locale, 'signup.successBody')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <Link href="/signup/resend" className="text-sm underline">
              {t(locale, 'signup.resend.link')}
            </Link>
            <Link href="/admin/login" className="text-sm underline">
              {t(locale, 'signup.backToLogin')}
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{t(locale, 'signup.title')}</CardTitle>
        <CardDescription>{t(locale, 'signup.intro')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {refusalMessage && !refusedField && (
            <Alert variant="destructive">{refusalMessage}</Alert>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="signup-code">{t(locale, 'signup.code')}</Label>
            <Input
              id="signup-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="signup-name">{t(locale, 'signup.name')}</Label>
            <Input
              id="signup-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="signup-email">{t(locale, 'signup.email')}</Label>
            <Input
              id="signup-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              aria-invalid={fieldError('email') !== null}
              required
            />
            {fieldError('email') && (
              <p className="text-destructive text-sm">{fieldError('email')}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="signup-password">
              {t(locale, 'signup.password')}
            </Label>
            <Input
              id="signup-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              aria-invalid={fieldError('password') !== null}
              required
            />
            {fieldError('password') ? (
              <p className="text-destructive text-sm">
                {fieldError('password')}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t(locale, 'signup.passwordHint')}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="signup-site-name">
              {t(locale, 'signup.siteName')}
            </Label>
            <Input
              id="signup-site-name"
              value={siteName}
              onChange={(event) => setSiteName(event.target.value)}
              aria-invalid={fieldError('siteName') !== null}
              required
            />
            {fieldError('siteName') && (
              <p className="text-destructive text-sm">
                {fieldError('siteName')}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="signup-deployment">
              {t(locale, 'signup.deployment')}
            </Label>
            <Input
              id="signup-deployment"
              value={deployment}
              onChange={(event) => setEditedDeployment(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={issue !== null || fieldError('deployment') !== null}
              required
            />
            {issue ? (
              <p className="text-destructive text-sm">
                {t(locale, `signup.issue.${issue}`)}
              </p>
            ) : fieldError('deployment') ? (
              <p className="text-destructive text-sm">
                {fieldError('deployment')}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t(locale, 'signup.deploymentHint')}
              </p>
            )}
          </div>

          {humanCheck.fields}

          <Button
            type="submit"
            disabled={sending || !humanCheck.solved || issue !== null}
          >
            {sending
              ? t(locale, 'signup.submitting')
              : t(locale, 'signup.submit')}
          </Button>

          <p className="text-muted-foreground text-sm">
            {t(locale, 'signup.resend.formPrompt')}{' '}
            <Link href="/signup/resend" className="underline">
              {t(locale, 'signup.resend.formLink')}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

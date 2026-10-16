'use client';

import {
  type AuthFormStatus,
  type SignupAvailability,
  type SignupField,
  SignupFormView
} from '@codeware/app-cms/ui/auth';
import { useHumanCheck } from '@codeware/shared/ui/cms-renderer';
import { type SupportedLocale, t } from '@codeware/shared/util/i18n';
import {
  deploymentNameIssue,
  tenantSiteUrl,
  toDeploymentName
} from '@codeware/shared/util/pure';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import type { SignupRefusal } from '../../../utils/signup';

type Props = {
  /** The host app's name, which tenant sites are named after */
  hostAppName: string;
  locale: SupportedLocale;
  /** Turnstile's site key; without one no widget is drawn */
  siteKey?: string;
};

/** Wait for the typing to pause before asking whether the address is free */
const AVAILABILITY_DELAY_MS = 400;

/** The address the answer was about, with the answer; null when none came */
type Answer = { deployment: string; available: boolean | null };

/** What the field says about the current address */
const availabilityOf = (
  deployment: string,
  askable: boolean,
  pending: string | null,
  answer: Answer | null
): SignupAvailability | undefined => {
  if (!askable) return undefined;
  if (answer?.deployment === deployment) {
    if (answer.available === null) return undefined;
    return answer.available ? 'available' : 'taken';
  }
  return pending === deployment ? 'checking' : undefined;
};

const isAnswer = (value: unknown): value is { available: boolean } =>
  typeof value === 'object' &&
  value !== null &&
  'available' in value &&
  typeof value.available === 'boolean';

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
export function SignupForm({ hostAppName, locale, siteKey }: Props) {
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

  // A well-formed address is worth a preview and a question to the server
  const askable = deployment !== '' && issue === null;
  const siteUrl = askable ? tenantSiteUrl(hostAppName, deployment) : undefined;

  // The address being asked about, and the latest answer; neither says
  // anything about a value typed since
  const [pending, setPending] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const availability = availabilityOf(deployment, askable, pending, answer);

  useEffect(() => {
    if (!askable) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPending(deployment);
      try {
        const response = await fetch(
          `/api/signup/available?deployment=${encodeURIComponent(deployment)}`,
          { signal: controller.signal }
        );
        const body: unknown = await response.json();
        if (controller.signal.aborted) return;
        // Anything but an answer ends the check; the signup decides in the end
        setAnswer({
          deployment,
          available: response.ok && isAnswer(body) ? body.available : null
        });
      } catch {
        if (!controller.signal.aborted)
          setAnswer({ deployment, available: null });
      }
    }, AVAILABILITY_DELAY_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [deployment, askable]);

  const refusedField = refusal ? REFUSAL_FIELD[refusal] : undefined;
  const refusalMessage = refusal ? t(locale, `signup.error.${refusal}`) : null;
  const fieldError = (field: Field) =>
    refusedField === field ? refusalMessage : null;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      submitting.current ||
      !humanCheck.solved ||
      issue !== null ||
      availability === 'taken'
    ) {
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

  const onChange = (field: SignupField, value: string) => {
    switch (field) {
      case 'code':
        return setCode(value);
      case 'name':
        return setName(value);
      case 'email':
        return setEmail(value);
      case 'password':
        return setPassword(value);
      case 'siteName':
        return setSiteName(value);
      case 'deployment':
        return setEditedDeployment(value);
    }
  };

  const status: AuthFormStatus = done
    ? 'sent'
    : sending
      ? 'submitting'
      : refusal
        ? 'refused'
        : 'idle';

  // A malformed address is worded before the server's own refusal
  const deploymentError = issue
    ? t(locale, `signup.issue.${issue}`)
    : fieldError('deployment');

  return (
    <SignupFormView
      labels={{
        title: t(locale, 'signup.title'),
        intro: t(locale, 'signup.intro'),
        code: t(locale, 'signup.code'),
        name: t(locale, 'signup.name'),
        email: t(locale, 'signup.email'),
        password: t(locale, 'signup.password'),
        passwordHint: t(locale, 'signup.passwordHint'),
        siteName: t(locale, 'signup.siteName'),
        deployment: t(locale, 'signup.deployment'),
        deploymentHint: t(locale, 'signup.deploymentHint'),
        sectionInvite: t(locale, 'signup.section.invite'),
        sectionYou: t(locale, 'signup.section.you'),
        sectionSite: t(locale, 'signup.section.site'),
        inviteCodeHelp: t(locale, 'signup.inviteCodeHelp'),
        addressPreview: t(locale, 'signup.addressPreview'),
        availabilityChecking: t(locale, 'signup.availability.checking'),
        availabilityAvailable: t(locale, 'signup.availability.available'),
        availabilityTaken: t(locale, 'signup.error.deployment-taken'),
        submit: t(locale, 'signup.submit'),
        submitting: t(locale, 'signup.submitting'),
        successTitle: t(locale, 'signup.successTitle'),
        successBody: t(locale, 'signup.successBody')
      }}
      values={{ code, name, email, password, siteName, deployment }}
      fieldErrors={{
        email: fieldError('email') ?? undefined,
        password: fieldError('password') ?? undefined,
        siteName: fieldError('siteName') ?? undefined,
        deployment: deploymentError ?? undefined
      }}
      siteUrl={siteUrl}
      availability={availability}
      status={status}
      refusal={refusedField ? null : refusalMessage}
      canSubmit={
        humanCheck.solved && issue === null && availability !== 'taken'
      }
      humanCheck={humanCheck.fields}
      footer={
        <>
          <p>
            {t(locale, 'signup.resend.formPrompt')}{' '}
            <Link href="/signup/resend">
              {t(locale, 'signup.resend.formLink')}
            </Link>
          </p>
          <Link href="/admin/login">{t(locale, 'signup.backToLogin')}</Link>
        </>
      }
      sentFooter={
        <>
          <Link href="/signup/resend">{t(locale, 'signup.resend.link')}</Link>
          <Link href="/admin/login">{t(locale, 'signup.backToLogin')}</Link>
        </>
      }
      onChange={onChange}
      onSubmit={onSubmit}
    />
  );
}

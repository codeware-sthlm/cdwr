import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { AuthCard } from '@codeware/app-cms/ui/auth';
import { Alert } from '@codeware/shared/ui/shadcn/components/alert';
import { t } from '@codeware/shared/util/i18n';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPayload } from 'payload';

import config from '../../../payload.config';
import { getRequestLocale } from '../../../utils/request-locale';
import { hostAppName, isSignupOpen } from '../../../utils/signup';

import { SignupForm } from './SignupForm.client';

export const metadata: Metadata = {
  title: 'Sign up',
  robots: { index: false }
};

/**
 * Where a person with an invite code makes a site of their own.
 *
 * Only the host serves it, and only while signup is open; the setting is read
 * on every request, so closing signup takes effect at once.
 */
export default async function SignupPage() {
  const env = getEnv();
  if (env.APP_MODE.type !== 'host') {
    notFound();
  }

  const locale = await getRequestLocale();

  const payload = await getPayload({ config });

  if (!(await isSignupOpen(payload))) {
    return (
      <AuthCard title={t(locale, 'signup.title')}>
        <Alert>{t(locale, 'signup.closed')}</Alert>
      </AuthCard>
    );
  }

  return (
    <SignupForm
      hostAppName={hostAppName()}
      locale={locale}
      siteKey={env.HUMAN_CHECK?.siteKey}
    />
  );
}

import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { Alert } from '@codeware/shared/ui/shadcn/components/alert';
import { type SupportedLocale, t } from '@codeware/shared/util/i18n';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getPayload } from 'payload';

import config from '../../../payload.config';

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

  const accepted = (await headers()).get('accept-language') ?? '';
  const locale: SupportedLocale = accepted.toLowerCase().startsWith('sv')
    ? 'sv'
    : 'en';

  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: 'platform-settings',
    depth: 0,
    limit: 1,
    overrideAccess: true
  });

  if (docs[0]?.signupOpen !== true) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">{t(locale, 'signup.title')}</h1>
        <Alert>{t(locale, 'signup.closed')}</Alert>
      </div>
    );
  }

  return <SignupForm locale={locale} siteKey={env.HUMAN_CHECK?.siteKey} />;
}

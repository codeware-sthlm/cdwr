import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { type SupportedLocale, t } from '@codeware/shared/util/i18n';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { ResendForm } from './ResendForm.client';

const localeFromHeader = (accepted: string): SupportedLocale =>
  accepted.toLowerCase().startsWith('sv') ? 'sv' : 'en';

export async function generateMetadata(): Promise<Metadata> {
  const accepted = (await headers()).get('accept-language') ?? '';
  return {
    title: t(localeFromHeader(accepted), 'signup.resend.title'),
    robots: { index: false }
  };
}

/**
 * Where a new signup asks for the confirmation mail again.
 *
 * Only the host serves it. It is open whether or not signup is, since the
 * person already signed up.
 */
export default async function ResendPage() {
  const env = getEnv();
  if (env.APP_MODE.type !== 'host') {
    notFound();
  }

  const accepted = (await headers()).get('accept-language') ?? '';
  const locale = localeFromHeader(accepted);

  return <ResendForm locale={locale} siteKey={env.HUMAN_CHECK?.siteKey} />;
}

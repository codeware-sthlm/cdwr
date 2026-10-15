import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { type SupportedLocale } from '@codeware/shared/util/i18n';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { ResendForm } from './ResendForm.client';

export const metadata: Metadata = {
  title: 'Send the confirmation email again',
  robots: { index: false }
};

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
  const locale: SupportedLocale = accepted.toLowerCase().startsWith('sv')
    ? 'sv'
    : 'en';

  return <ResendForm locale={locale} siteKey={env.HUMAN_CHECK?.siteKey} />;
}

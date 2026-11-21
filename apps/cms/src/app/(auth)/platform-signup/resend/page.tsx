import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { t } from '@codeware/shared/util/i18n';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getRequestLocale } from '../../../../utils/request-locale';

import { ResendForm } from './ResendForm.client';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: t(await getRequestLocale(), 'signup.resend.title'),
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

  const locale = await getRequestLocale();

  return <ResendForm locale={locale} siteKey={env.HUMAN_CHECK?.siteKey} />;
}

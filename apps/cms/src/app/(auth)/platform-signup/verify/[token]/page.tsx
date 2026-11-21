import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { VerifyResultView } from '@codeware/app-cms/ui/auth';
import { t } from '@codeware/shared/util/i18n';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getRequestLocale } from '../../../../../utils/request-locale';

import { confirmEmail } from './actions';

export const metadata: Metadata = {
  title: 'Confirm your address',
  robots: { index: false }
};

/**
 * Where the link in the confirmation mail leads. Only the host serves it.
 *
 * Opening the link only asks for a click: mail scanners follow links, and the
 * token is spent by the button's server action, which lands back here with
 * the result. A used token is cleared, so an expired link and one used before
 * read the same, and both get the way to a new link.
 */
export default async function VerifyPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  if (getEnv().APP_MODE.type !== 'host') {
    notFound();
  }

  const { token } = await params;
  const { result } = await searchParams;
  const locale = await getRequestLocale();

  const state =
    result === 'verified' || result === 'invalid' ? result : 'confirm';

  return (
    <VerifyResultView
      state={state}
      confirmAction={confirmEmail.bind(null, token)}
      labels={{
        confirmTitle: t(locale, 'signup.verify.confirmTitle'),
        confirmBody: t(locale, 'signup.verify.confirmBody'),
        confirm: t(locale, 'signup.verify.confirm'),
        verifiedTitle: t(locale, 'signup.verify.verifiedTitle'),
        verifiedBody: t(locale, 'signup.verify.verifiedBody'),
        invalidTitle: t(locale, 'signup.verify.invalidTitle'),
        invalidBody: t(locale, 'signup.verify.invalidBody'),
        signIn: t(locale, 'signup.verify.signIn'),
        newLink: t(locale, 'signup.verify.newLink')
      }}
      signInHref="/admin/login"
      newLinkHref="/signup/resend"
    />
  );
}

'use client';

import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import { useTranslation } from '@payloadcms/ui';
import Link from 'next/link';
import React from 'react';

/**
 * Link under the login form to ask for the confirmation mail again
 * (`admin.components.afterLogin`).
 *
 * `/signup/resend` only exists on the host, so the server decides whether to
 * render this at all and passes the result down.
 */
export function ResendConfirmationLink({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();

  if (!enabled) {
    return null;
  }

  return (
    <p className="codeware-admin twp mt-4 text-center text-sm">
      <Link href="/signup/resend" className="underline">
        {t('login:resendConfirmation')}
      </Link>
    </p>
  );
}

export default ResendConfirmationLink;

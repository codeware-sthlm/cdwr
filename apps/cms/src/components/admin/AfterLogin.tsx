import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { customT } from '@codeware/app-cms/util/i18n';
import Link from 'next/link';
import type { ServerProps } from 'payload';
import React from 'react';

import { SIGNUP_PATH } from '../../utils/platform-signup';

/**
 * Point a visitor without an account to signup, under the login form.
 *
 * Only the host has a signup, and only while it is open; the setting is read
 * on every request, like the signup page itself does.
 */
const AfterLogin: React.FC<ServerProps> = async ({ i18n, payload }) => {
  if (!payload || getEnv().APP_MODE.type !== 'host') {
    return null;
  }

  const { docs } = await payload.find({
    collection: 'platform-settings',
    depth: 0,
    limit: 1,
    overrideAccess: true
  });

  if (docs[0]?.signupOpen !== true) {
    return null;
  }

  const t = customT(i18n.t);

  return (
    <p className="codeware-admin twp text-muted-foreground text-center text-sm">
      {t('authentication:newHere')}{' '}
      <Link
        className="hover:text-foreground underline underline-offset-4"
        href={SIGNUP_PATH}
        prefetch={false}
      >
        {t('authentication:createSite')}
      </Link>
    </p>
  );
};

export default AfterLogin;

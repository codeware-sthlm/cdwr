'use client';

import {
  type AuthLanguage,
  LanguageSwitchView
} from '@codeware/app-cms/ui/auth';
import { useRouter } from 'next/navigation';

type Props = {
  current: AuthLanguage;
  /** The cookie the admin keeps its language in */
  cookieName: string;
  label: string;
};

const ONE_YEAR_SECONDS = 31536000;

/** Sets the language the auth pages and the admin sign-in share, and reloads */
export function LanguageSwitch({ current, cookieName, label }: Props) {
  const router = useRouter();

  return (
    <LanguageSwitchView
      current={current}
      label={label}
      onSelect={(language) => {
        document.cookie = `${cookieName}=${language}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
        router.refresh();
      }}
    />
  );
}

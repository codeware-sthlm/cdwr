'use client';

import {
  PayloadProvider,
  type PayloadValue
} from '@codeware/shared/ui/cms-renderer';
import type {
  FormSubmitResponse,
  TourSignupResponse
} from '@codeware/shared/ui/cms-renderer';
import type {
  FormSubmission,
  SiteSettingsGeneral
} from '@codeware/shared/util/payload-types';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { useTheme } from 'next-themes';

import { THEME_COOKIE, THEME_COOKIE_MAX_AGE } from './theme-cookie';

type ProvidersProps = {
  children: React.ReactNode;
  /** Light/dark policy from site settings, not the current state */
  colorScheme: SiteSettingsGeneral['colorScheme'];
  /** How the header and its controls are drawn */
  chrome: PayloadValue['chrome'];
} & Pick<
  PayloadValue,
  | 'appInfo'
  | 'humanCheck'
  | 'iconConfig'
  | 'locale'
  | 'payloadUrl'
  | 'signupPolicy'
  | 'theme'
  | 'themes'
>;

/**
 * Combines all client-side providers needed for the CMS site.
 * Wraps children with ThemeProvider and PayloadProvider.
 */
export function Providers({
  children,
  appInfo,
  chrome,
  colorScheme,
  humanCheck,
  iconConfig,
  locale,
  payloadUrl,
  signupPolicy,
  theme,
  themes
}: ProvidersProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      // A locked site never leaves its scheme; next-themes handles this
      // natively, so no switch has to be suppressed downstream
      forcedTheme={colorScheme === 'system' ? undefined : colorScheme}
    >
      <PayloadProviderInner
        appInfo={appInfo}
        chrome={chrome}
        colorScheme={colorScheme}
        humanCheck={humanCheck}
        iconConfig={iconConfig}
        locale={locale}
        payloadUrl={payloadUrl}
        signupPolicy={signupPolicy}
        theme={theme}
        themes={themes}
      >
        {children}
      </PayloadProviderInner>
    </NextThemesProvider>
  );
}

function PayloadProviderInner({
  children,
  appInfo,
  chrome,
  colorScheme: colorSchemePolicy,
  humanCheck,
  iconConfig,
  locale,
  payloadUrl,
  signupPolicy,
  theme,
  themes
}: ProvidersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    theme: colorScheme,
    resolvedTheme: resolvedColorScheme,
    setTheme: setColorScheme
  } = useTheme();

  return (
    <PayloadProvider
      value={{
        appInfo,
        getCurrentPath: () => pathname,
        getSearchParam: (name) => searchParams.get(name),
        humanCheck,
        iconConfig,
        locale,
        navigate: (path, newTab) => {
          if (newTab || path.startsWith('http')) {
            window.open(path, '_blank');
          } else {
            router.push(path);
          }
        },
        payloadUrl,
        setColorScheme: (colorScheme) => setColorScheme(colorScheme),
        // The server picks the theme from this cookie, so persist it before
        // refreshing — otherwise the re-render returns the previous theme
        setTheme: (next) => {
          document.cookie = `${THEME_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
          router.refresh();
        },
        signupPolicy,
        submitForm: async (data): Promise<FormSubmitResponse> => {
          try {
            const response = await fetch('/api/form-submissions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.message || 'Form submission failed');
            }

            const result = await response.json();

            // API route returns minimal data: { success: true, id: string }
            // Convert to expected FormSubmission shape for compatibility
            return {
              success: true,
              data: {
                id: result.id,
                form: data.form,
                submissionData: data.submissionData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              } as FormSubmission
            };
          } catch (error) {
            return {
              success: false,
              data: {
                error: error instanceof Error ? error.message : 'Unknown error'
              }
            };
          }
        },
        submitTourSignup: async (data): Promise<TourSignupResponse> => {
          try {
            const response = await fetch('/api/tour-signups', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });

            const result = await response.json();

            if (!response.ok) {
              throw new Error(result.message || 'Tour signup failed');
            }

            // The status comes from the server: a signup for a full tour lands
            // on the waiting list, and the form says so rather than guessing
            return {
              success: true,
              data: { id: result.id, status: result.status }
            };
          } catch (error) {
            return {
              success: false,
              data: {
                error: error instanceof Error ? error.message : 'Unknown error'
              }
            };
          }
        },
        chrome,
        colorScheme: (colorScheme as 'light' | 'dark' | 'system') ?? 'system',
        lockedColorScheme:
          colorSchemePolicy === 'system' ? null : colorSchemePolicy,
        resolvedColorScheme: resolvedColorScheme as 'light' | 'dark',
        theme,
        themes
      }}
    >
      {children}
    </PayloadProvider>
  );
}

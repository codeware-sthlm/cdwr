import {
  customThemeCss,
  resolveTheme,
  themeLabel
} from '@codeware/shared/theme';
import {
  ErrorContainer,
  PayloadProvider,
  type PayloadValue,
  RenderLayout
} from '@codeware/shared/ui/cms-renderer';
import {
  type FooterData,
  type NavigationItem,
  type SignupPolicy,
  findLandingDoc,
  getNavigationTree,
  getSiteSettings,
  resolveFooter,
  resolveSignupPolicy
} from '@codeware/shared/util/payload-api';
import type { LandingDoc } from '@codeware/shared/util/payload-utils';
import type { LinksFunction } from '@remix-run/node';
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  json,
  useFetcher,
  useLoaderData,
  useNavigate
} from '@remix-run/react';
import * as Sentry from '@sentry/react';
import * as React from 'react';

import { GeneralErrorBoundary } from './components/error-boundary';
import {
  COLOR_SCHEME_ACTION,
  useColorScheme,
  useOptimisticColorScheme
} from './routes/resources.color-scheme-switch';
import { THEME_ACTION } from './routes/resources.theme-switch';
import stylesheet from './tailwind.css?url';
import { getAppInfo } from './utils/app-info';
import { getClientEnv } from './utils/client-env';
import { ClientHintCheck, getHints } from './utils/client-hints';
import { type ColorScheme, getColorScheme } from './utils/color-scheme.server';
import { getPayloadRequestOptions } from './utils/get-payload-request-options';
import { getTheme } from './utils/theme.server';
import { TypedLoaderFunctionArgs } from './utils/types';

/** What the site renders when a tenant has no theme settings yet. */
const FALLBACK_THEME = 'spotlight';

/**
 * The scheme a tenant locks its site to, or `null` when the visitor may switch.
 *
 * Mirrors how `apps/cms` derives it at the provider boundary: `system` is a
 * policy, not a paintable scheme.
 */
function resolveLockedColorScheme(
  tenantConfig: { colorScheme?: string } | null | undefined
): ColorScheme | null {
  const policy = tenantConfig?.colorScheme;

  return policy === 'light' || policy === 'dark' ? policy : null;
}

export const links: LinksFunction = () => [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous'
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap'
  },
  { rel: 'stylesheet', href: stylesheet }
];

export async function loader({ context, request }: TypedLoaderFunctionArgs) {
  /** Error message to display to the user when we have e.g. API issues */
  let loaderErrorMessage = '';

  try {
    // Get the color scheme before fetching pages in case it fails
    const colorScheme = await getColorScheme(request);
    const tenantConfig = context.tenantConfig;

    // Theme is resolved server-side so the first paint is already correct.
    // The cookie only wins while it names a theme the site still offers.
    const themes = tenantConfig?.themes?.length
      ? tenantConfig.themes
      : [FALLBACK_THEME];
    const theme = resolveTheme(
      await getTheme(request),
      themes,
      tenantConfig?.defaultTheme ?? FALLBACK_THEME
    );

    let footer: FooterData | null = null;
    let signupPolicy: SignupPolicy | null = null;
    let landingDoc: LandingDoc | null = null;
    let navigationTree: Array<NavigationItem> = [];

    // Fetch layout data but don't propagate the exception to the error boundary
    try {
      if (!tenantConfig) {
        throw new Error('No tenant configuration available in loader context');
      }

      // Fetch landing page, navigation tree and site settings with proper locale
      const requestOptions = getPayloadRequestOptions(
        'GET',
        context,
        request.headers
      );
      const response = await Promise.all([
        findLandingDoc(tenantConfig.landingPage, requestOptions),
        getNavigationTree(requestOptions),
        getSiteSettings(requestOptions)
      ]);

      landingDoc = response[0];
      navigationTree = response[1];
      footer = resolveFooter(response[2], navigationTree);
      // What the tour signup form has to disclose about personal data
      signupPolicy = resolveSignupPolicy(response[2]);
    } catch (e) {
      const error = e as Error;
      console.error(`Failed to load data: ${error.message}`);
      loaderErrorMessage =
        'Unable to load application content. Please try again later.';
    }

    return json({
      // Never the raw server env — this is serialized into the HTML
      env: getClientEnv(),
      appInfo: getAppInfo(),
      footer,
      loaderErrorMessage,
      landingDoc,
      signupPolicy,
      theme,
      themes,
      navigationTree,
      requestInfo: {
        hints: getHints(request),
        path: new URL(request.url).pathname,
        userPrefs: {
          locale: context.tenantConfig?.locale ?? 'en',
          colorScheme
        }
      },
      tenantConfig
    });
  } catch (error) {
    console.error('Failed to load root data:\n', error);
    // Delegate to error boundary
    throw error;
  }
}

function Document({
  children,
  lang,
  colorScheme = 'light',
  theme = FALLBACK_THEME,
  customCss
}: {
  children: React.ReactNode;
  lang: string;
  colorScheme?: ColorScheme;
  theme?: string;
  customCss?: string;
}) {
  return (
    <html lang={lang} className={colorScheme} data-theme={theme}>
      <head>
        <ClientHintCheck />
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/*
          Tenant-authored tokens, which are not in the CSS bundle — every theme
          block is scoped to its own `[data-theme]` and nothing sits at bare
          `:root`, so without these an authored theme paints nothing at all
          rather than falling back to the default one.

          `customThemeCss` whitelists every name and value it writes, so the
          result holds no `<`, `>` or `&` and is safe as a text child — no
          `dangerouslySetInnerHTML` needed.
        */}
        {customCss && <style>{customCss}</style>}
        <Meta />
        <Links />
      </head>
      <body className="flex h-full">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const visitorColorScheme = useColorScheme();
  const loaderData = useLoaderData<typeof loader>();
  const lang = loaderData.requestInfo.userPrefs.locale;

  // A tenant that locks its scheme wins over the visitor's cookie and hint —
  // hiding the switch alone would leave a stale choice painted
  const lockedColorScheme = resolveLockedColorScheme(loaderData.tenantConfig);

  // Every authored theme, not only the resolved one, so the switcher repaints
  // without a round trip — the same set `apps/cms` emits
  const customCss = customThemeCss(loaderData.tenantConfig?.customThemes ?? []);

  return (
    <Document
      colorScheme={lockedColorScheme ?? visitorColorScheme}
      lang={lang}
      theme={loaderData.theme}
      customCss={customCss}
    >
      {children}
    </Document>
  );
}

export default function App() {
  const loaderData = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const tenantId = loaderData.env.TENANT_ID;

  /** Authored themes carry the name they were saved under; built-ins do not. */
  const customLabels = new Map(
    (loaderData.tenantConfig?.customThemes ?? []).map(({ slug, name }) => [
      slug,
      name
    ])
  );

  // Two different values, and the switch needs both: the *preference* decides
  // which icon it shows (including `system`), while the *resolved* scheme is
  // what is actually painted. Reading the optimistic value first keeps the
  // control responsive while the action round-trips.
  const colorSchemePreference =
    useOptimisticColorScheme() ??
    loaderData.requestInfo.userPrefs.colorScheme ??
    'system';
  const resolvedColorScheme = useColorScheme();

  // One bundle serves every tenant, so the client learns which one it is from
  // the loader rather than at build time
  React.useEffect(() => {
    Sentry.setTag('tenant', tenantId);
  }, [tenantId]);

  // Provide app opinionated context to Payload components
  const context: PayloadValue = {
    appInfo: loaderData.appInfo,
    // The tenant's own chrome, falling back to what every site rendered
    // before the setting existed
    chrome: loaderData.tenantConfig?.chrome ?? 'outlined',
    getCurrentPath: () => loaderData.requestInfo.path,
    iconConfig: loaderData.tenantConfig?.icon ?? null,
    navigate: (path, newTab) => {
      const isExternal = path.startsWith('http');
      // Open new tab
      if (newTab) {
        window.open(path, '_blank');
        return;
      }
      // Native redirect external links
      if (isExternal) {
        window.location.href = path;
        return;
      }
      // Invoke router event for internal links
      navigate(path);
    },
    payloadUrl: loaderData.env.PAYLOAD_URL,
    setColorScheme: (colorScheme) =>
      fetcher.submit(
        { colorScheme },
        { method: 'POST', action: COLOR_SCHEME_ACTION }
      ),
    signupPolicy: loaderData.signupPolicy,
    submitForm: async (formData) => {
      try {
        // Send to server-side action to use secure API key authentication
        const response = await fetch('/form-submission', {
          method: 'POST',
          body: JSON.stringify(formData),
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const result = await response.json();
        return { data: result, success: true };
      } catch (e) {
        const error = e as Error;
        return {
          success: false,
          data: { error: error?.message ?? 'Unknown error' }
        };
      }
    },
    submitTourSignup: async (data) => {
      try {
        // Send to server-side action to use secure API key authentication
        const response = await fetch('/tour-signup', {
          method: 'POST',
          body: JSON.stringify(data),
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const result = await response.json();

        if (!response.ok || !result?.success) {
          throw new Error(
            result?.message ?? `Server returned ${response.status}`
          );
        }

        // The status is the server's answer, not the client's assumption — a
        // signup for a full tour comes back queued
        return {
          success: true,
          data: { id: result.id, status: result.status }
        };
      } catch (e) {
        const error = e as Error;
        return {
          success: false,
          data: { error: error?.message ?? 'Unknown error' }
        };
      }
    },
    colorScheme: colorSchemePreference,
    resolvedColorScheme,
    lockedColorScheme: resolveLockedColorScheme(loaderData.tenantConfig),
    // Labels ride along with the values so the renderer never shows a raw slug
    // and stays free of a list it would have to know about. `themeLabel` only
    // knows the built-ins, so an authored theme needs the name it was saved
    // under — the same lookup `apps/cms` builds.
    themes: loaderData.themes.map((value) => ({
      value,
      label: customLabels.get(value) ?? themeLabel(value)
    })),
    theme: loaderData.theme,
    setTheme: (theme) =>
      fetcher.submit({ theme }, { method: 'POST', action: THEME_ACTION }),
    locale: loaderData.requestInfo.userPrefs.locale
  };

  return (
    <PayloadProvider value={context}>
      <RenderLayout
        footer={loaderData.footer}
        navigationTree={loaderData.navigationTree}
      >
        {/* A loader failure replaces the page rather than rendering an empty
            one — the layout itself still comes up */}
        {loaderData.loaderErrorMessage ? (
          <ErrorContainer severity="error">
            {loaderData.loaderErrorMessage}
          </ErrorContainer>
        ) : (
          <Outlet />
        )}
      </RenderLayout>
    </PayloadProvider>
  );
}

// this is a last resort error boundary. There's not much useful information we
// can offer at this level.
export const ErrorBoundary = GeneralErrorBoundary;

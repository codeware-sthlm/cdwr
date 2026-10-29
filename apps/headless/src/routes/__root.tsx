import {
  ErrorContainer,
  PayloadProvider,
  type PayloadValue,
  RenderLayout
} from '@codeware/shared/ui/cms-renderer';
import { NotFound } from '@codeware/shared/ui/primitives';
import { ogLocale } from '@codeware/shared/util/payload-utils';
import { STATS_PATH, statsScript } from '@codeware/shared/util/umami';
import * as Sentry from '@sentry/tanstackstart-react';
import {
  type ErrorComponentProps,
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useLocation,
  useRouter
} from '@tanstack/react-router';
import { ThemeProvider, useTheme } from 'next-themes';
import { type ReactNode, useEffect } from 'react';

import { isClientPath } from '../navigate';
import { readSearchParam } from '../search-param';
import { loadSite } from '../server/load-site';
import appCss from '../styles.css?url';

export const Route = createRootRoute({
  loader: () => loadSite(),
  // The tenant chrome rarely changes; do not refetch it on every navigation
  staleTime: 60_000,
  // A page's own head replaces these tags by name or property, the deepest
  // route winning, so what is set here is what a page states nothing about
  head: ({ loaderData }) => {
    const site = loaderData?.ok ? loaderData.site : null;
    const locale = ogLocale(site?.locale);
    const icon = site?.iconConfig ?? null;

    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: site?.appName ?? 'Site' },
        ...(site
          ? [
              { property: 'og:type', content: 'website' },
              { property: 'og:site_name', content: site.appName },
              ...(locale ? [{ property: 'og:locale', content: locale }] : []),
              { name: 'twitter:card', content: 'summary' }
            ]
          : [])
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        // The tab in the tenant's own mark: an SVG is the favicon as it is,
        // with no PNGs drawn from it here; an upload is used as is
        ...(icon?.source === 'svg'
          ? [{ rel: 'icon', href: '/site-icon.svg', type: 'image/svg+xml' }]
          : icon?.source === 'upload'
            ? [
                { rel: 'icon', href: icon.fileUrl },
                { rel: 'apple-touch-icon', href: icon.fileUrl }
              ]
            : [])
      ]
    };
  },
  component: RootComponent,
  notFoundComponent: RootNotFound,
  errorComponent: RootError,
  shellComponent: RootDocument
});

/** The scheme a site is locked to, or null when visitors choose */
function lockedScheme(
  site: { colorSchemePolicy: 'system' | 'light' | 'dark' } | null
): 'light' | 'dark' | null {
  return site?.colorSchemePolicy === 'light' ||
    site?.colorSchemePolicy === 'dark'
    ? site.colorSchemePolicy
    : null;
}

function RootDocument({ children }: { children: ReactNode }) {
  const data = Route.useLoaderData();
  const site = data?.ok ? data.site : null;
  const locked = lockedScheme(site);
  // The nonce is per request, so it is read here and not carried by the
  // loader; `stats` stands in for the Umami url, which stays on the server.
  // The scripts and their beacons all go to this app's own `/stats` relay
  const nonce = useRouter().options.ssr?.nonce;
  const stats = statsScript({
    umamiUrl: site?.stats ? STATS_PATH : undefined,
    websiteId: site?.statsWebsiteId,
    nonce
  });

  return (
    <html
      lang={site?.locale ?? 'en'}
      data-theme={site?.theme}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
        {/* Authored themes are not in the CSS bundle. The generator whitelists
            every name and value, so the text holds no markup */}
        {site?.customCss && <style>{site.customCss}</style>}
        {site?.fontFaceCss && <style>{site.fontFaceCss}</style>}
        {stats && (
          <>
            <script defer {...stats.tracker} />
            <script defer {...stats.recorder} />
          </>
        )}
      </head>
      <body className="flex h-full">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          // A locked site never leaves its scheme
          forcedTheme={locked ?? undefined}
          nonce={nonce}
        >
          {children}
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const data = Route.useLoaderData();
  const location = useLocation();
  const router = useRouter();
  const {
    theme: colorScheme,
    resolvedTheme: resolvedColorScheme,
    setTheme: setColorScheme
  } = useTheme();

  const locked = lockedScheme(data.ok ? data.site : null);

  if (!data.ok) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center p-8">
        <p role="alert">{data.message}</p>
      </main>
    );
  }

  const { site } = data;

  return (
    <PayloadProvider
      value={{
        appInfo: site.appInfo,
        chrome: site.chrome,
        colorScheme:
          colorScheme === 'light' || colorScheme === 'dark'
            ? colorScheme
            : 'system',
        getCurrentPath: () => location.pathname,
        getSearchParam: (name) => readSearchParam(location.searchStr, name),
        iconConfig: site.iconConfig,
        locale: site.locale,
        lockedColorScheme: locked,
        navigate: (path, newTab) => {
          if (newTab) {
            window.open(path, '_blank');
          } else if (isClientPath(path)) {
            void router.navigate({ href: path });
          } else {
            window.location.assign(path);
          }
        },
        payloadUrl: site.payloadUrl,
        // Unknown until mount; the pre-paint script has set the class by then.
        // `resolvedTheme` ignores a forced theme, so a locked scheme wins
        resolvedColorScheme:
          locked ?? (resolvedColorScheme === 'dark' ? 'dark' : 'light'),
        setColorScheme: (next) => setColorScheme(next),
        // One theme per deployment until a switcher is wanted
        setTheme: () => undefined,
        signupPolicy: data.signupPolicy,
        // Forms post to a route of this app, which does not exist yet
        submitForm: async () => ({
          success: false,
          data: { error: 'Form submissions are not available yet' }
        }),
        submitTourSignup: async () => ({
          success: false,
          data: { error: 'Tour signups are not available yet' }
        }),
        theme: site.theme,
        // The selector shows from two themes up; switching is not built yet
        themes: site.themes.filter(({ value }) => value === site.theme)
      }}
    >
      <RenderLayout footer={data.footer} navigationTree={data.navigationTree}>
        <Outlet />
      </RenderLayout>
    </PayloadProvider>
  );
}

function RootNotFound() {
  const router = useRouter();
  const data = Route.useLoaderData();

  return (
    <NotFound
      locale={data?.ok ? data.site.locale : 'en'}
      onGoHome={() => void router.navigate({ to: '/' })}
    />
  );
}

function RootError({ error }: ErrorComponentProps) {
  // The message can carry internals; the server log and Sentry have them
  console.error('Route failed:', error);

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <ErrorContainer severity="error">
      Something went wrong. Please try again later.
    </ErrorContainer>
  );
}

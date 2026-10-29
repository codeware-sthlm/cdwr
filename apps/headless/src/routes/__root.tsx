import {
  ErrorContainer,
  PayloadProvider,
  type PayloadValue,
  RenderLayout
} from '@codeware/shared/ui/cms-renderer';
import { NotFound } from '@codeware/shared/ui/primitives';
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
import { type ReactNode, useEffect, useState } from 'react';

import { isClientPath } from '../navigate';
import { readSearchParam } from '../search-param';
import { loadSite } from '../server/load-site';
import appCss from '../styles.css?url';

export const Route = createRootRoute({
  loader: () => loadSite(),
  // The tenant chrome rarely changes; do not refetch it on every navigation
  staleTime: 60_000,
  head: ({ loaderData }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: loaderData?.ok ? loaderData.site.appName : 'Site' }
    ],
    links: [{ rel: 'stylesheet', href: appCss }]
  }),
  component: RootComponent,
  notFoundComponent: RootNotFound,
  errorComponent: RootError,
  shellComponent: RootDocument
});

function RootDocument({ children }: { children: ReactNode }) {
  const data = Route.useLoaderData();
  const site = data?.ok ? data.site : null;
  const locked =
    site?.colorSchemePolicy === 'light' || site?.colorSchemePolicy === 'dark'
      ? site.colorSchemePolicy
      : null;
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
      className={locked ?? 'light'}
      data-theme={site?.theme}
    >
      <head>
        <HeadContent />
        {/* Authored themes are not in the CSS bundle. The generator whitelists
            every name and value, so the text holds no markup */}
        {site?.customCss && <style>{site.customCss}</style>}
        {stats && (
          <>
            <script defer {...stats.tracker} />
            <script defer {...stats.recorder} />
          </>
        )}
      </head>
      <body className="flex h-full">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const data = Route.useLoaderData();
  const location = useLocation();
  const router = useRouter();
  const [colorScheme, setColorScheme] =
    useState<NonNullable<PayloadValue['colorScheme']>>('system');
  const [systemDark, setSystemDark] = useState(false);

  const locked =
    data.ok &&
    (data.site.colorSchemePolicy === 'light' ||
      data.site.colorSchemePolicy === 'dark')
      ? data.site.colorSchemePolicy
      : null;
  const resolvedColorScheme =
    locked ??
    (colorScheme === 'system' ? (systemDark ? 'dark' : 'light') : colorScheme);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setSystemDark(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle(
      'dark',
      resolvedColorScheme === 'dark'
    );
    document.documentElement.classList.toggle(
      'light',
      resolvedColorScheme === 'light'
    );
  }, [resolvedColorScheme]);

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
        colorScheme,
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
        resolvedColorScheme,
        setColorScheme,
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

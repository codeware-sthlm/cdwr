import {
  PayloadProvider,
  type PayloadValue,
  RenderLayout
} from '@codeware/shared/ui/cms-renderer';
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useLocation
} from '@tanstack/react-router';
import { type ReactNode, useEffect, useState } from 'react';

import { readSearchParam } from '../search-param';
import { loadSite } from '../server/load-site';
import appCss from '../styles.css?url';

export const Route = createRootRoute({
  loader: () => loadSite(),
  head: ({ loaderData }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: loaderData?.ok ? loaderData.site.appName : 'Site' }
    ],
    links: [{ rel: 'stylesheet', href: appCss }]
  }),
  component: RootComponent,
  shellComponent: RootDocument
});

function RootDocument({ children }: { children: ReactNode }) {
  const data = Route.useLoaderData();
  const site = data?.ok ? data.site : null;
  const locked =
    site?.colorSchemePolicy === 'light' || site?.colorSchemePolicy === 'dark'
      ? site.colorSchemePolicy
      : null;

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
        themes: site.themes
      }}
    >
      <RenderLayout footer={data.footer} navigationTree={data.navigationTree}>
        <Outlet />
      </RenderLayout>
    </PayloadProvider>
  );
}

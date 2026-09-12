import {
  FALLBACK_THEME,
  getFooter,
  getNavigationTree,
  getSignupPolicy,
  getTenantContext
} from '@codeware/app-cms/data-access';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  customThemeCss,
  resolveTheme,
  themeLabel
} from '@codeware/shared/theme';
import { RenderLayout } from '@codeware/shared/ui/cms-renderer';
import {
  entitledFonts,
  fontFaceCss,
  selfServedFontsIn
} from '@codeware/shared/util/color';
import { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import './site.css';
import { getAppInfo } from '../../app-info';
import { payloadRuntime } from '../../security/payload-runtime';

import { Providers } from './providers';
import { THEME_COOKIE } from './theme-cookie';

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const tenantContext = await getTenantContext();

  // Redirect to admin panel if no tenant context (admin-only deployment)
  if (!tenantContext) {
    redirect('/admin');
  }

  // Get authenticated payload instance
  const runtime = await payloadRuntime();

  // Fetch navigation and footer with proper access control and tenant scoping
  const navigationTree = await getNavigationTree(runtime);
  const footer = await getFooter(runtime, navigationTree);

  // What a tour signup form has to disclose; the same for every tour
  const signupPolicy = await getSignupPolicy(runtime);

  // Parsed once and shared — `getEnv()` revalidates `process.env` on every call
  const env = getEnv();

  // Theme is resolved server-side so the first paint is already correct.
  // A tenant without theme settings falls back to what sites rendered before
  // the setting existed (getSiteSettings normalises that).
  const themes = runtime.tenantConfig?.themes ?? [FALLBACK_THEME];
  const defaultTheme = runtime.tenantConfig?.defaultTheme ?? FALLBACK_THEME;
  const theme = resolveTheme(
    (await cookies()).get(THEME_COOKIE)?.value,
    themes,
    defaultTheme
  );

  // Authored themes are not in the CSS bundle, so their tokens come with them
  const customThemes = runtime.tenantConfig?.customThemes ?? [];
  const customCss = customThemeCss(customThemes);

  // A licensed face may only be embedded on a site Codeware owns or controls,
  // so the entitlement belongs to the deployment rather than to whoever chose
  // the font — and which deployment is settled by where the secret lives.
  // Driven off the tokens because those are what renders, and only for a
  // family the platform serves itself: Inter comes from the bundle.
  const fontFaces = entitledFonts(
    selfServedFontsIn(
      customThemes.flatMap(({ tokensLight, tokensDark }) => [
        tokensLight,
        tokensDark
      ])
    ),
    env.RESTRICTED_FONTS
  )
    .map((font) => fontFaceCss(font, env.FONT_ASSETS_BASE_URL))
    .join('');
  const customLabels = new Map(
    customThemes.map(({ slug, name }) => [slug, name])
  );

  // The renderer takes labels with the values so it never shows a raw slug,
  // and stays free of a closed list it would have to know about
  const themeChoices = themes.map((value) => ({
    value,
    label: customLabels.get(value) ?? themeLabel(value)
  }));

  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <head>
        {/* Needed? */}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/*
          Tenant-authored tokens. `customThemeCss` whitelists every name and
          value it writes, so the result holds no `<`, `>` or `&` and is safe
          as a text child — no dangerouslySetInnerHTML needed.
        */}
        {fontFaces && <style>{fontFaces}</style>}
        {customCss && <style>{customCss}</style>}
      </head>
      <body>
        <Providers
          appInfo={getAppInfo(env)}
          iconConfig={runtime.tenantConfig?.icon ?? null}
          humanCheck={
            env.HUMAN_CHECK ? { siteKey: env.HUMAN_CHECK.siteKey } : null
          }
          locale={runtime.tenantConfig?.locale ?? 'en'}
          payloadUrl={env.APP_MODE.serverURL}
          signupPolicy={signupPolicy}
          chrome={runtime.tenantConfig?.chrome ?? 'outlined'}
          colorScheme={runtime.tenantConfig?.colorScheme ?? 'system'}
          theme={theme}
          themes={themeChoices}
        >
          <RenderLayout footer={footer} navigationTree={navigationTree}>
            {children}
          </RenderLayout>
        </Providers>
      </body>
    </html>
  );
}

// TODO: fetch metadata or static data?
export const metadata: Metadata = {
  title: 'Codeware CMS',
  description:
    'A headless CMS built with Payload CMS and Next.js, designed for flexibility and ease of use.'
};

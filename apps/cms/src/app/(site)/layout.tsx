import {
  FALLBACK_THEME,
  getFooter,
  getNavigationTree,
  getSignupPolicy,
  getTenantContext,
  hasMembersContent
} from '@codeware/app-cms/data-access';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { isUser } from '@codeware/app-cms/util/misc';
import {
  BUILT_IN_TOKENS,
  THEME_COOKIE,
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
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import './site.css';
import { getAppInfo } from '../../app-info';
import { payloadRuntime } from '../../security/payload-runtime';
import {
  MEMBER_LOGIN_PATH,
  MEMBER_LOGOUT_SUBMIT_PATH
} from '../../utils/member-login';
import { siteOrigin } from '../../utils/page-metadata';

import { Providers } from './providers';

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
  const runtime = await payloadRuntime({ asVisitor: true });

  // Fetch navigation and footer with proper access control and tenant scoping
  const navigationTree = await getNavigationTree(runtime);
  const footer = await getFooter(runtime, navigationTree);

  // The sign-in slot appears only on a site that gates something — a signed-in
  // member always needs it, so they can sign out again
  const member = isUser(runtime.payload.authenticatedUser)
    ? runtime.payload.authenticatedUser
    : null;
  const session =
    member || (await hasMembersContent(runtime))
      ? {
          name: member?.name ?? null,
          loginPath: MEMBER_LOGIN_PATH,
          logoutPath: MEMBER_LOGOUT_SUBMIT_PATH
        }
      : undefined;

  // What a tour signup form has to disclose; the same for every tour
  const signupPolicy = await getSignupPolicy(runtime);

  // Parsed once and shared — `getEnv()` revalidates `process.env` on every call
  const env = getEnv();

  // Theme is resolved server-side so the first paint is already correct.
  // A tenant without theme settings falls back to what sites rendered before
  // the setting existed (getGeneralSiteSettings normalises that).
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
    selfServedFontsIn([
      ...customThemes.flatMap(({ tokensLight, tokensDark }) => [
        tokensLight,
        tokensDark
      ]),
      // A built-in may name a licensed face too, which only an entitled
      // deployment embeds; elsewhere its stack falls back to Inter
      ...themes.flatMap((name) => {
        const builtIn = BUILT_IN_TOKENS[name];
        return builtIn ? [builtIn.light, builtIn.dark] : [];
      })
    ]),
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
    // The site's own language, so a screen reader and a translator hear it
    // right; Next writes the charset and viewport tags itself
    <html
      lang={runtime.tenantConfig?.locale ?? 'en'}
      data-theme={theme}
      suppressHydrationWarning
    >
      <head>
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
          humanCheckSiteKey={env.HUMAN_CHECK?.siteKey ?? null}
          locale={runtime.tenantConfig?.locale ?? 'en'}
          payloadUrl={env.APP_MODE.serverURL}
          signupPolicy={signupPolicy}
          chrome={runtime.tenantConfig?.chrome ?? 'outlined'}
          colorScheme={runtime.tenantConfig?.colorScheme ?? 'system'}
          theme={theme}
          themes={themeChoices}
        >
          <RenderLayout
            footer={footer}
            navigationTree={navigationTree}
            session={session}
          >
            {children}
          </RenderLayout>
        </Providers>
      </body>
    </html>
  );
}

/**
 * The tab and the bookmark in the tenant's own name and mark.
 *
 * An SVG mark is served as the favicon as it is, since browsers take one, with
 * PNGs drawn from it for those that want a bitmap and for a home screen. An
 * uploaded mark is used as uploaded. Without one the app's default stays.
 */
export async function generateMetadata(): Promise<Metadata> {
  const runtime = await payloadRuntime({ asVisitor: true });
  const config = runtime.tenantConfig;
  const icon = config?.icon ?? null;
  const headerList = await headers();

  return {
    // Resolves a relative upload URL, such as a page's sharing image
    metadataBase: siteOrigin(
      headerList.get('host'),
      headerList.get('x-forwarded-proto')
    ),
    // A page names itself; the site follows it
    title: {
      default: config?.appName ?? 'Codeware CMS',
      template: `%s · ${config?.appName ?? 'Codeware CMS'}`
    },
    // For a page stating no Open Graph of its own
    openGraph: { siteName: config?.appName ?? 'Codeware CMS' },
    ...(icon?.source === 'svg' && {
      icons: {
        icon: [
          { url: '/site-icon.svg', type: 'image/svg+xml' },
          { url: '/site-icon.png', type: 'image/png', sizes: '32x32' }
        ],
        apple: [
          { url: '/site-apple-icon.png', type: 'image/png', sizes: '180x180' }
        ]
      }
    }),
    ...(icon?.source === 'upload' && {
      icons: { icon: icon.fileUrl, apple: icon.fileUrl }
    })
  };
}

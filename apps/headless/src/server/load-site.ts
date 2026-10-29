import {
  customThemeCss,
  resolveTheme,
  themeLabel
} from '@codeware/shared/theme';
import type { AppInfo, PayloadValue } from '@codeware/shared/ui/cms-renderer';
import {
  type FooterData,
  type NavigationItem,
  type RequestBaseOptions,
  type SignupPolicy,
  findLandingDoc,
  getNavigationTree,
  getSiteSettings,
  getTenantConfig,
  resolveFooter,
  resolveSignupPolicy
} from '@codeware/shared/util/payload-api';
import { createServerFn } from '@tanstack/react-start';
import { setResponseStatus } from '@tanstack/react-start/server';

import pkg from '../../package.json';
import { getEnv } from '../env.server';

import { payloadRequestOptions } from './payload-request';
import { resolveSiteOrigin } from './site-origin';

/** What the document needs from the tenant, with nothing that is secret */
export type SiteChrome = {
  appName: string;
  appInfo: AppInfo;
  chrome: PayloadValue['chrome'];
  colorSchemePolicy: 'system' | 'light' | 'dark';
  customCss: string;
  iconConfig: PayloadValue['iconConfig'];
  locale: string;
  payloadUrl: string;
  /** The site's own origin, when it can be told */
  origin: string | null;
  /** Whether statistics are collected at all: Umami is configured */
  stats: boolean;
  /** The site's id in Umami, when it has one */
  statsWebsiteId: string | null;
  theme: string;
  themes: PayloadValue['themes'];
};

export type Site =
  | {
      ok: true;
      site: SiteChrome;
      /**
       * JSON text of the landing `LandingDoc`: Payload types its JSON fields
       * `unknown`, which a server function refuses to return as typed data
       */
      landingDocJson: string | null;
      navigationTree: Array<NavigationItem>;
      footer: FooterData | null;
      signupPolicy: SignupPolicy | null;
    }
  | { ok: false; message: string };

/**
 * Load everything the home page needs from the cms headless API.
 *
 * Runs on the server only: the tenant api key is attached here and never
 * reaches the browser.
 */
export const loadSite = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Site> => {
    try {
      const env = getEnv();
      const base = payloadRequestOptions(env);

      const tenantConfig = await getTenantConfig(base);
      if (!tenantConfig) {
        throw new Error(`No tenant configuration for '${env.TENANT_ID}'`);
      }

      const options: RequestBaseOptions = {
        ...base,
        locale: tenantConfig.locale
      };
      const [landingDoc, navigationTree, siteSettings] = await Promise.all([
        findLandingDoc(tenantConfig.landingPage, options),
        getNavigationTree(options),
        getSiteSettings(options)
      ]);

      const customLabels = new Map(
        tenantConfig.customThemes.map(({ slug, name }) => [slug, name])
      );

      return {
        ok: true,
        site: {
          appName: tenantConfig.appName,
          appInfo: {
            name: 'headless',
            version: pkg.version,
            sha: env.APP_SHA ?? '',
            deployEnv: env.DEPLOY_ENV,
            buildTime: env.APP_BUILD_TIME ?? ''
          },
          chrome: tenantConfig.chrome ?? 'outlined',
          colorSchemePolicy: tenantConfig.colorScheme,
          customCss: customThemeCss(tenantConfig.customThemes),
          iconConfig: tenantConfig.icon,
          locale: tenantConfig.locale,
          payloadUrl: env.PAYLOAD_URL,
          origin: resolveSiteOrigin(
            tenantConfig.tenant.domains,
            env.FLY_APP_NAME
          ),
          stats: !!env.UMAMI_URL,
          statsWebsiteId: tenantConfig.tenant.statsWebsiteId ?? null,
          theme: resolveTheme(
            undefined,
            tenantConfig.themes,
            tenantConfig.defaultTheme
          ),
          themes: tenantConfig.themes.map((value) => ({
            value,
            label: customLabels.get(value) ?? themeLabel(value)
          }))
        },
        landingDocJson: landingDoc && JSON.stringify(landingDoc),
        navigationTree,
        footer: resolveFooter(siteSettings, navigationTree),
        signupPolicy: resolveSignupPolicy(siteSettings)
      };
    } catch (error) {
      console.error('Failed to load site content:', error);
      setResponseStatus(503);
      return {
        ok: false,
        message: 'Unable to load application content. Please try again later.'
      };
    }
  }
);

import path from 'path';
import { fileURLToPath } from 'url';

import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { seed } from '@codeware/app-cms/feature/seed';
import {
  aboutBlock,
  blockGalleryBlock,
  calloutBlock,
  cardBlock,
  codeBlock,
  contentBlock,
  featureCardsBlock,
  featureSectionBlock,
  fileAreaBlock,
  formBlock,
  heroBlock,
  imageBlock,
  mediaBlock,
  pillListBlock,
  postsBlock,
  reusableContentBlock,
  showcaseBlock,
  socialMediaBlock,
  spacingBlock,
  testimonialBlock,
  toursBlock
} from '@codeware/app-cms/ui/blocks';
import { defaultLexical } from '@codeware/app-cms/ui/fields';
import { getEmailAdapter } from '@codeware/app-cms/util/email';
import { customTranslations } from '@codeware/app-cms/util/i18n';
import { isTenant, isUser } from '@codeware/app-cms/util/misc';
import {
  getPlugins,
  withSubmissionDeliveryTracking
} from '@codeware/app-cms/util/plugins';
import type { Tenant } from '@codeware/shared/util/payload-types';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities';
import { en } from '@payloadcms/translations/languages/en';
import { sv } from '@payloadcms/translations/languages/sv';
import * as Sentry from '@sentry/nextjs';
import { buildConfig } from 'payload';
import sharp from 'sharp';

import { getAppInfo } from './app-info';
import { collections, users } from './collections';
import { createLegalPageEndpoint } from './endpoints/create-legal-page';
import { domainDnsComparisonEndpoint } from './endpoints/domain-dns-comparison';
import { formSubmissionsExportEndpoint } from './endpoints/form-submissions-export';
import { formSubmissionsReadEndpoint } from './endpoints/form-submissions-read';
import { paletteSearchEndpoint } from './endpoints/palette-search';
import { perfStatsEndpoint } from './endpoints/perf-stats';
import { platformDomainCertificateEndpoint } from './endpoints/platform-domain-certificate';
import { platformMachineRestartEndpoint } from './endpoints/platform-machine-restart';
import { tenantConfigEndpoint } from './endpoints/tenant-config';
import { tenantDomainCertificateEndpoint } from './endpoints/tenant-domain-certificate';
import { tenantMachineRestartEndpoint } from './endpoints/tenant-machine-restart';
import { tourSignupsAnonymizeEndpoint } from './endpoints/tour-signups-anonymize';
import { tourSignupsExportEndpoint } from './endpoints/tour-signups-export';
import { tourSignupsReorderEndpoint } from './endpoints/tour-signups-reorder';
import { anonymizeTourSignupsTask } from './jobs/anonymize-tour-signups.task';
import { queryStatsLogger } from './perf/query-stats';
import { userOnlyAccess } from './security/user-only-access';
import { userOrApiKeyAccess } from './security/user-or-api-key-access';
import { adoptPlatformDomains } from './utils/adopt-platform-domains';
import { adoptTenantDomains } from './utils/adopt-tenant-domains';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const env = getEnv();

const emailAdapter = getEmailAdapter(env);

export default buildConfig({
  serverURL: env.APP_MODE.serverURL,
  admin: {
    user: users.slug,
    dateFormat: 'yyyy-MM-dd HH:mm:ss',
    components: {
      actions: [
        '@codeware/apps/cms/components/admin/LanguageSwitch.client',
        '@codeware/apps/cms/components/admin/ColorSchemeSwitch.client',
        '@codeware/apps/cms/components/admin/HelpDrawer.client',
        '@codeware/apps/cms/components/admin/LocaleSwitch.client',
        '@codeware/apps/cms/components/admin/palette/PaletteTrigger.client',
        {
          // Registered unconditionally to keep the import map stable; the
          // profiler only exists in development, so gate on the rendered side.
          path: '@codeware/apps/cms/components/admin/PerfStatsLink.client',
          clientProps: { enabled: env.DEPLOY_ENV === 'development' }
        },
        {
          // Client dialog host mounted (invisibly) in the actions row; opened
          // from the command palette via `OPEN_ABOUT_EVENT`. Build metadata is
          // resolved server-side at config load and passed as client props.
          path: '@codeware/apps/cms/components/admin/AboutDialogHost.client',
          clientProps: { appInfo: getAppInfo(env) }
        }
      ],
      // The login screen is where a refused session lands, so it is the one
      // place the warning has to reach even when nothing else renders
      beforeLogin: ['@codeware/apps/cms/components/admin/DomainMismatchNotice'],
      graphics: {
        Icon: '@codeware/apps/cms/components/Icon.client',
        Logo: '@codeware/apps/cms/components/Logo.client'
      },
      Nav: '@codeware/apps/cms/components/admin/AdminNavWrapper',
      providers: [
        '@codeware/apps/cms/components/admin/palette/PaletteProvider.client'
      ],
      views: {
        dashboard: {
          Component:
            '@codeware/apps/cms/components/admin/dashboard/AdminDashboardView'
        },
        // Its own route rather than a field: a platform theme has no row to
        // hang one off, and what the view offers is a fork, not an edit
        themeLibrary: {
          Component:
            '@codeware/apps/cms/components/admin/theme-library/ThemeLibraryView',
          path: '/theme-library'
        }
      }
    },
    livePreview: {
      breakpoints: [
        { label: 'Mobile', name: 'mobile', width: 375, height: 667 },
        { label: 'Tablet', name: 'tablet', width: 768, height: 1024 },
        { label: 'Desktop', name: 'desktop', width: 1440, height: 900 }
      ],
      collections: ['pages', 'posts', 'tours'],
      url: ({ data, collectionConfig, locale }) => {
        // Live preview is not enabled in host mode
        if (env.APP_MODE.type === 'host') {
          return null;
        }
        // Pages live at the root, other collections below their own slug
        const prefix =
          collectionConfig?.slug === 'pages'
            ? ''
            : `/${collectionConfig?.slug}`;
        const sitePath = `${prefix}/${data.slug}?locale=${locale.code}`;
        return `/api/preview?redirect=${encodeURIComponent(sitePath)}`;
      }
    }
  },
  // Declare blocks globally and reference then by slug elsewhere
  // https://payloadcms.com/docs/fields/blocks#block-references
  blocks: [
    aboutBlock,
    blockGalleryBlock,
    calloutBlock,
    cardBlock,
    codeBlock,
    contentBlock,
    featureCardsBlock,
    featureSectionBlock,
    fileAreaBlock,
    formBlock,
    heroBlock,
    imageBlock,
    mediaBlock,
    pillListBlock,
    postsBlock,
    reusableContentBlock,
    showcaseBlock,
    socialMediaBlock,
    spacingBlock,
    testimonialBlock,
    toursBlock
  ],
  collections,
  cors:
    env.CORS_URLS === '*'
      ? '*'
      : [
          env.FLY_URL ?? '', // Always allow the app's own Fly URL
          ...env.CORS_URLS.split(',')
        ].filter(Boolean),
  csrf: env.CSRF_URLS ? env.CSRF_URLS.split(',').filter(Boolean) : undefined,
  db: postgresAdapter({
    pool: {
      connectionString: env.DATABASE_URL
    },
    schemaName: env.DATABASE_SCHEMA,
    migrationDir: path.resolve(dirname, 'migrations'),
    // Ensure db push is disabled during build-time
    push: env.DISABLE_DB_PUSH === false && env.NX_RUN_TARGET !== 'build',
    // Installed on dev boots only; records nothing until started from
    // /api/perf-stats, so it costs a no-op call per query until then
    ...(env.DEPLOY_ENV === 'development' ? { logger: queryStatsLogger } : {})
  }),
  editor: defaultLexical,
  email: emailAdapter && withSubmissionDeliveryTracking(emailAdapter),
  endpoints: [
    createLegalPageEndpoint,
    domainDnsComparisonEndpoint,
    formSubmissionsExportEndpoint,
    formSubmissionsReadEndpoint,
    paletteSearchEndpoint,
    perfStatsEndpoint,
    platformDomainCertificateEndpoint,
    platformMachineRestartEndpoint,
    tenantConfigEndpoint,
    tenantDomainCertificateEndpoint,
    tenantMachineRestartEndpoint,
    tourSignupsAnonymizeEndpoint,
    tourSignupsExportEndpoint,
    tourSignupsReorderEndpoint
  ],
  jobs: {
    tasks: [anonymizeTourSignupsTask],
    // Scheduling only queues the job; something has to run the queue. Both are
    // skipped during build, where no long-running process exists to hold a cron
    autoRun:
      env.NX_RUN_TARGET === 'build'
        ? []
        : [{ cron: '5 3 * * *', queue: 'nightly', limit: 10 }],
    deleteJobOnComplete: true
  },
  plugins: getPlugins(env, {
    access: { read: userOrApiKeyAccess(), write: userOnlyAccess() }
  }),
  // A refused signup is an answer, not a fault: log the message and skip the
  // stack. The key is `SignupRefusedError`'s own name, so every other
  // `APIError` still logs in full.
  loggingLevels: { SignupRefused: 'info' } as Parameters<
    typeof buildConfig
  >[0]['loggingLevels'],
  secret: env.PAYLOAD_SECRET_KEY,
  // 25 MB covers an image, a document and a short audio file, and stops an
  // upload large enough to exhaust a 1 GB machine from being attempted at all
  upload: { safeFileNames: true, limits: { fileSize: 25 * 1024 * 1024 } },
  // i18n support
  i18n: {
    fallbackLanguage: 'en',
    supportedLanguages: { en, sv },
    translations: customTranslations
  },
  localization: {
    locales: [
      {
        label: {
          en: 'English',
          sv: 'Engelska'
        },
        code: 'en'
      },
      {
        label: {
          en: 'Swedish',
          sv: 'Svenska'
        },
        code: 'sv'
      }
    ],
    defaultLocale: 'en',
    fallback: true,
    // Filter available locales based on current tenant.
    // Payload calls this several times per render, so the lookup is cached on
    // the request context to keep it to a single query.
    filterAvailableLocales: async ({ req, locales }) => {
      const tenantId = getTenantFromCookie(req.headers, 'text');
      if (tenantId) {
        const key = `availableLocalesTenant:${tenantId}`;
        // `context` is typed as required but treated as optional elsewhere,
        // and skipping the cache is harmless — only fall back to it
        const context = req.context as Record<string, unknown> | undefined;
        let lookup = context?.[key] as Promise<Tenant | null> | undefined;

        if (!lookup) {
          lookup = req.payload
            .findByID({ id: tenantId, collection: 'tenants', req })
            .catch((error) => {
              // Never leave a rejected promise cached for the rest of the request
              if (context) {
                delete context[key];
              }
              throw error;
            });
          if (context) {
            context[key] = lookup;
          }
        }

        const tenant = await lookup;
        if (tenant && tenant.supportedLocales.length) {
          return locales.filter((locale) => {
            return tenant.supportedLocales.map(String).includes(locale.code);
          });
        }
      }
      return locales;
    }
  },
  // Act when Payload is initialized (after db connection, migrations, etc. are done)
  onInit: async (payload) => {
    if (env.NX_RUN_TARGET === 'build') {
      payload.logger.info(
        'Payload onInit skipped during build to prevent side effects'
      );
      return;
    }

    payload.logger.info(`Using ${payload.db.name} database adapter`);

    // Before anything generates a link or answers an origin: a custom domain
    // lives in the database, so it cannot be known when the config above is
    // built. Platform first — it is the host app's own identity, ahead of
    // any tenant-scoped domain
    await adoptPlatformDomains(payload);
    await adoptTenantDomains(payload);

    if (env.EMAIL?.sendgrid) {
      payload.logger.info('Using SendGrid email adapter');
    }
    if (env.EMAIL?.smtp) {
      const { host, pass, user } = env.EMAIL.smtp;

      // A half-configured pair connects unauthenticated and every send is
      // then rejected by the relay — true but baffling from the error alone,
      // so say which half is missing while the cause is still obvious
      if (Boolean(user) !== Boolean(pass)) {
        payload.logger.warn(
          `[email] Only SMTP_${user ? 'USERNAME' : 'PASSWORD'} is set — both are needed to authenticate, so mail to ${host} is being sent unauthenticated and will likely be rejected`
        );
      }

      payload.logger.info(
        `Using SMTP email adapter (${host}${user && pass ? ', authenticated' : ''})`
      );
    }
    if (!env.EMAIL) {
      // Nothing configured does not mean nothing sends: in development
      // `getEmailAdapter` still hands back an on-demand Ethereal inbox, so
      // ask the resolved adapter what it is rather than re-deriving that rule
      // here, where the two would drift apart
      payload.logger.info(
        payload.email?.name === 'ethereal-fallback'
          ? 'No email configured — using an on-demand Ethereal inbox, a preview link is logged per message'
          : 'Email is disabled'
      );
    }

    payload.logger.info('Payload is ready');
    if (
      env.APP_MODE.type === 'host' ||
      env.NX_RUN_TARGET === 'seed' ||
      (env.APP_MODE.type === 'tenant' && env.DEPLOY_ENV === 'development')
    ) {
      // Run seeding for app cms host, on demand via cli or for tenants in development
      await seed({
        environment: env.DEPLOY_ENV,
        payload,
        remoteDataUrl: env.SEED_DATA_URL,
        source: env.SEED_SOURCE,
        strategy: env.SEED_STRATEGY
      });
    } else if (env.APP_MODE.type === 'tenant') {
      payload.logger.info(
        'Skipping seeding for tenant mode in non-development environment'
      );
    }
  },
  // Generate types and schemas
  typescript: {
    outputFile: path.resolve(
      dirname,
      '../../..',
      'libs/shared/util/payload-types/src/lib/payload-types.ts'
    )
  },
  graphQL: {
    disable: true,
    schemaOutputFile: path.resolve(dirname, 'generated', 'schema.graphql')
  },
  // Misc
  debug: env.LOG_LEVEL === 'debug',
  telemetry: false,
  sharp,
  // Capture Payload errors in Sentry (same as payload sentry plugin brings)
  hooks: {
    afterError: [
      async ({ collection, error, req: { headers, payload, user } }) => {
        const status =
          'status' in error && typeof error.status === 'number'
            ? error.status
            : 500;

        // Capture server errors (500+)
        if (status >= 500) {
          const email = isUser(user) ? user.email : 'n/a';
          const tenant_slug = isTenant(user) ? user.slug : '';
          const context: Sentry.ExclusiveEventHintOrCaptureContext = {
            extra: {
              errorCollectionSlug: collection?.slug
            },
            ...(user && {
              user: {
                id: user.id,
                collection: user.collection,
                name: user.name,
                email,
                tenant_slug,
                ip_address:
                  // Extract only the first IP address in case the request passes through multiple proxies
                  headers?.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
                  undefined
              }
            })
          };

          const eventId = Sentry.captureException(error, context);

          if (env.LOG_LEVEL === 'debug') {
            payload.logger.info(
              `Captured Payload exception ${eventId} to Sentry: ${error.message}`
            );
          }
        }
      }
    ]
  }
});

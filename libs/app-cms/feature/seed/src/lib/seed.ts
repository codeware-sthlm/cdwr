import { randomBytes } from 'crypto';

import { convertMarkdownToLexical } from '@codeware/app-cms/util/content-templates';
import type {
  SeedSource,
  SeedStrategy
} from '@codeware/app-cms/util/env-schema';
import { generateSeedIcon } from '@codeware/shared/ui/seed-icon-studio';
import type { Payload } from 'payload';

import { applySiteDefinition } from './apply-site-definition';
import { definitionFor } from './definition-for';
import { loadInfisicalData } from './load-infisical-data';
import { loadStaticData } from './load-static-data';
import { ensureFaq } from './local-api/ensure-faq';
import { ensurePlace } from './local-api/ensure-place';
import { ensurePlatformLabel } from './local-api/ensure-platform-label';
import { ensurePlatformSettings } from './local-api/ensure-platform-settings';
import { ensureSiteSetting } from './local-api/ensure-site-setting';
import { ensureStockMedia } from './local-api/ensure-stock-media';
import { ensureTenant } from './local-api/ensure-tenant';
import { ensureTour } from './local-api/ensure-tour';
import { ensureUser } from './local-api/ensure-user';
import type {
  SeedData,
  SeedEnvironment,
  StaticSeedOptions
} from './seed-types';
import {
  labelIcon,
  splitLabelKey,
  usedLabelsSorted
} from './utils/platform-label-icons';
import { createSeedStore } from './utils/temp-store';

/**
 * Seed Payload collections.
 *
 * The seed process is designed to only make changes when needed.
 * It can run multiple times without creating duplicates.
 *
 * Data is loaded from Infisical or local static data depending on the seed source.
 *
 * If no data is found, seeding is skipped.
 *
 * Database transaction is used when supported by the database.
 *
 * @returns `true` if seeding was successful or skipped for a reason, otherwise `false`
 * @throws Never - just logs errors
 */
export const seed = async (
  args: {
    environment: SeedEnvironment;
    payload: Payload;
    source: SeedSource;
    strategy: SeedStrategy;
  } & Pick<StaticSeedOptions, 'remoteDataUrl'>
): Promise<boolean> => {
  const { environment, payload, remoteDataUrl, source, strategy } = args;

  // Support transactions
  // Ids recorded as documents are created, read back when later ones
  // reference them. Scoped to this run
  const store = createSeedStore();

  let transactionID: string | number | undefined;

  /**
   * Start a new transaction when there is no transaction active.
   *
   * Accessable via `transactionID`
   */
  const ensureTransaction = async () => {
    if (transactionID) {
      return;
    }
    transactionID = (await payload.db.beginTransaction()) ?? undefined;
    if (transactionID) {
      payload.logger.info(`[SEED] Started transaction ${transactionID}`);
    }
  };

  /** Commit or rollback the current transaction when available */
  const endTransaction = async (action: 'commit' | 'rollback') => {
    if (!transactionID) {
      return;
    }
    if (action === 'commit') {
      payload.logger.info(`[SEED] Commit transaction ${transactionID}`);
      await payload.db.commitTransaction(transactionID);
    } else {
      payload.logger.info(`[SEED] Rollback transaction ${transactionID}`);
      await payload.db.rollbackTransaction(transactionID);
    }
    transactionID = undefined;
  };

  // Set to true when an error occurs to rollback the transaction at the end,
  // though there has been no exception thrown.
  let seedError = false;

  try {
    if (source === 'off') {
      payload.logger.info('[SEED] Seed source is off, skip seeding');
      return true;
    }

    if (strategy === 'once') {
      // Do not seed if tenants already exists
      const { totalDocs } = await payload.count({
        collection: 'tenants'
      });
      if (totalDocs > 0) {
        payload.logger.info(
          '[SEED] Seed strategy is once, tenants already exists, skip seeding'
        );
        return true;
      }
    }

    let seedData: SeedData | null = null;

    payload.logger.info('[SEED] Seed started');

    // Try to load seed data from Infisical when source has cloud
    if (source === 'cloud' || source === 'cloud-local') {
      seedData = await loadInfisicalData({ environment, payload });
    }

    // !! Production guard !! //
    // This will break DX since we can have local fallback for any environment.
    // At the moment we rather protect production data than risk it.
    if (!seedData && environment === 'production') {
      payload.logger.warn(
        `[SEED] Could not load secrets from cloud, skip seeding to protect ${environment} data`
      );
      return true;
    }

    // Fallback to static data when unable to seed from cloud
    if (!seedData && source === 'cloud-local') {
      payload.logger.info(
        '[SEED] Could not load secrets from cloud, fallback to local data'
      );
      seedData = loadStaticData({
        environment,
        payload,
        options: { remoteDataUrl }
      });
    }

    // Still no seed data, which is expected for local only, so get it
    if (!seedData && source === 'local') {
      seedData = loadStaticData({
        environment,
        payload,
        options: { remoteDataUrl }
      });
    }

    // Check seed data is loaded
    if (!seedData?.tenants?.length) {
      payload.logger.warn('[SEED] No seed data was loaded, skip seeding');
      return true;
    }

    // We have seed data, sync it to the database

    // TENANTS

    await ensureTransaction();
    for (const tenant of seedData.tenants) {
      try {
        const response = await ensureTenant(
          payload,
          {
            apiKey: tenant.apiKey,
            deployment: tenant.deployment,
            description: tenant.description,
            name: tenant.name,
            slug: tenant.slug,
            supportedLocales: tenant.supportedLocales
          },
          { locale: tenant.locale, transactionID }
        );

        let tenantId: number;
        if (typeof response === 'object') {
          payload.logger.info(
            `[SEED] Tenant '${tenant.name}' created (${tenant.locale} #${response.id})`
          );
          tenantId = response.id;
        } else {
          tenantId = Number(response);
        }
        // Save tenant id with seed data to map to lookup tenants later
        store.tenant(tenant.apiKey, { ...tenant, id: tenantId });
      } catch (error) {
        // Abort when we have a problem with a tenant
        payload.logger.error(
          `[SEED] Problem occurred with tenant '${tenant.name}', abort seeding`
        );
        throw error;
      }
    }

    // Need to commit the data otherwise Postgres will fail on foreign key constraints
    // for the related collections.
    await endTransaction('commit');
    const { totalDocs: tenantCount } = await payload.count({
      collection: 'tenants'
    });
    payload.logger.info(`[SEED] >> Tenants up to date (count: ${tenantCount})`);

    // USERS

    // Only seed users when no errors occurred
    if (!seedError && seedData.users.length > 0) {
      await ensureTransaction();

      let userFailed = 0;

      for (const user of seedData.users) {
        const tenants = store.lookupTenant(payload, user.tenants);

        try {
          const password =
            user.password ||
            (environment === 'development'
              ? 'dev'
              : environment === 'preview'
                ? 'pallevante'
                : // Production will not happen, but just in case
                  randomBytes(24).toString('base64url'));

          const response = await ensureUser(
            payload,
            {
              description: user.description,
              email: user.email,
              name: user.name,
              password,
              role: user.role,
              tenants: tenants.map(({ id, role }) => ({ tenant: id, role }))
            },
            { locale: user.locale, transactionID }
          );

          let userId: number;
          if (typeof response === 'object') {
            payload.logger.info(
              `[SEED] User '${user.name}' (${user.locale}) on tenants ${
                tenants.map(({ id, role }) => `#${id} (${role})`).join(', ') ||
                '<none>'
              }`
            );
            userId = response.id;
          } else {
            userId = Number(response);
          }
          // Save user id to map to lookup users later
          store.user(user.email, userId);
        } catch (e) {
          const error = e as Error;
          payload.logger.error(error.message);
          if ('data' in error) {
            payload.logger.error(
              `User '${user.email}'\n${JSON.stringify(error.data, null, 2)}`
            );
          }
          userFailed++;
        }
      }
      const { totalDocs: userCount } = await payload.count({
        collection: 'users',
        req: { transactionID }
      });
      payload.logger.info(
        userFailed
          ? `[SEED] Problem occurred for ${userFailed}/${seedData.users.length} users (count: ${userCount})`
          : `[SEED] >> Users up to date (count: ${userCount})`
      );
      seedError = seedError || userFailed > 0;
    }

    // PLATFORM LABELS

    // Derived from the data that uses them, so the shared vocabularies cannot
    // drift away from the documents referencing them. Must run before stock
    // media and places, which resolve their labels by name.
    const labelKey = (type: string, name: string) => `${type}:${name}`;
    const labelIds = new Map<string, number>();

    if (!seedError) {
      await ensureTransaction();

      const used = [
        ...new Set(
          seedData.stockMedia
            .map(({ subject }) => subject)
            .filter((name): name is string => Boolean(name))
            .map((name) => labelKey('stock-subject', name))
        ),
        ...new Set(
          seedData.places.map(({ kind }) => labelKey('place-kind', kind))
        )
      ];

      for (const key of usedLabelsSorted(used)) {
        const [type, name] = splitLabelKey(key);
        const response = await ensurePlatformLabel(
          payload,
          {
            type,
            name,
            icon: labelIcon(type, name),
            description: null
          },
          { transactionID }
        );
        labelIds.set(
          key,
          typeof response === 'object' ? response.id : Number(response)
        );
        if (typeof response === 'object') {
          payload.logger.info(`[SEED] Platform label '${type}/${name}'`);
        }
      }

      const { totalDocs: labelCount } = await payload.count({
        collection: 'platform-labels',
        req: { transactionID }
      });
      payload.logger.info(
        `[SEED] >> Platform labels up to date (count: ${labelCount})`
      );
    }

    // PLATFORM SETTINGS

    // Platform-owned singleton. Nothing to fill in yet — an admin edits it
    // from the collection once there is something to configure.
    if (!seedError) {
      await ensureTransaction();

      const response = await ensurePlatformSettings(payload, {
        transactionID
      });

      if (typeof response === 'object') {
        payload.logger.info('[SEED] Platform settings created');
      }
    }

    // STOCK MEDIA

    // Platform-owned shared library, seeded once without a tenant.
    // Must run before tours since hero images reference it.
    if (!seedError && seedData.stockMedia.length > 0) {
      await ensureTransaction();

      let stockFailed = 0;

      for (const { subject, ...stock } of seedData.stockMedia) {
        try {
          const response = await ensureStockMedia(
            payload,
            {
              ...stock,
              subject: subject
                ? labelIds.get(labelKey('stock-subject', subject))
                : undefined
            },
            { transactionID }
          );

          let stockId: number;
          if (typeof response === 'object') {
            payload.logger.info(`[SEED] Stock image '${stock.filename}'`);
            stockId = response.id;
          } else {
            stockId = Number(response);
          }
          // Shared across tenants, so keyed by filename alone
          store.stockMedia(stock.filename, stockId);
        } catch (e) {
          const error = e as Error;
          payload.logger.error(error.message);
          stockFailed++;
        }
      }
      const { totalDocs: stockCount } = await payload.count({
        collection: 'stock-media',
        req: { transactionID }
      });
      payload.logger.info(
        stockFailed
          ? `[SEED] Problem occurred for ${stockFailed}/${seedData.stockMedia.length} stock images (count: ${stockCount})`
          : `[SEED] >> Stock media up to date (count: ${stockCount})`
      );
      seedError = seedError || stockFailed > 0;
    }

    // PLACES

    // Only seed places when no errors occurred.
    // Must run before tours since itineraries reference them.
    if (!seedError && seedData.places.length > 0) {
      await ensureTransaction();

      let placeFailed = 0;

      for (const place of seedData.places) {
        const [entity] = store.lookupTenant(payload, [place.tenant]);
        const kind = labelIds.get(labelKey('place-kind', place.kind));

        // A place is classified or it is not seeded
        if (!kind) {
          payload.logger.error(
            `Skip: Place kind '${place.kind}' not found for '${place.name}'`
          );
          placeFailed++;
          continue;
        }

        try {
          const response = await ensurePlace(
            payload,
            {
              kind,
              name: place.name,
              note: place.note,
              url: place.url,
              tenant: entity.id
            },
            { locale: entity.locale, transactionID }
          );

          let placeId: number;
          if (typeof response === 'object') {
            payload.logger.info(
              `[SEED] Place '${place.name}' on tenant #${entity.id} (${entity.locale})`
            );
            placeId = response.id;
          } else {
            placeId = Number(response);
          }
          // Save place to map to lookup id's later
          store.place(
            { apiKey: place.tenant.lookupApiKey, slug: place.name },
            placeId
          );
        } catch (e) {
          const error = e as Error;
          payload.logger.error(error.message);
          if ('data' in error) {
            payload.logger.error(
              `Place '${place.name}'\n${JSON.stringify(error.data, null, 2)}`
            );
          }
          placeFailed++;
        }
      }
      const { totalDocs: placeCount } = await payload.count({
        collection: 'places',
        req: { transactionID }
      });
      payload.logger.info(
        placeFailed
          ? `[SEED] Problem occurred for ${placeFailed}/${seedData.places.length} places (count: ${placeCount})`
          : `[SEED] >> Places up to date (count: ${placeCount})`
      );
      seedError = seedError || placeFailed > 0;
    }

    // TOURS

    // Only seed tours when no errors occurred
    if (!seedError && seedData.tours.length > 0) {
      await ensureTransaction();

      let tourFailed = 0;

      for (const tour of seedData.tours) {
        const [entity] = store.lookupTenant(payload, [tour.tenant]);
        const heroImage = store.lookupStockMedia(payload, tour.heroImage);

        // A tour cannot be published without a header image
        if (!heroImage) {
          tourFailed++;
          continue;
        }

        try {
          const response = await ensureTour(
            payload,
            {
              bookingDeadline: tour.bookingDeadline,
              content: await convertMarkdownToLexical(
                payload.config,
                tour.content
              ),
              currency: tour.currency,
              departureDate: tour.departureDate,
              departureNote: tour.departureNote,
              destination: tour.destination,
              intent: tour.intent,
              duration: tour.duration,
              heroImage: {
                relationTo: 'stock-media' as const,
                value: heroImage
              },
              included: tour.included.map((item) => ({ item })),
              notIncluded: tour.notIncluded.map((item) => ({ item })),
              itinerary: tour.itinerary.map(({ places, ...day }) => ({
                ...day,
                places: store.lookupPlace(
                  payload,
                  (places ?? []).map((name) => ({
                    apiKey: tour.tenant.lookupApiKey,
                    slug: name
                  }))
                )
              })),
              price: tour.price,
              slug: tour.slug,
              summary: tour.summary,
              title: tour.title,
              tenant: entity.id
            },
            { locale: entity.locale, transactionID }
          );

          if (typeof response === 'object') {
            payload.logger.info(
              `[SEED] Tour '${tour.slug}' on tenant #${entity.id} (${entity.locale})`
            );
          }
        } catch (e) {
          const error = e as Error;
          payload.logger.error(error.message);
          if ('data' in error) {
            payload.logger.error(
              `Tour '${tour.slug}'\n${JSON.stringify(error.data, null, 2)}`
            );
          }
          tourFailed++;
        }
      }
      const { totalDocs: tourCount } = await payload.count({
        collection: 'tours',
        req: { transactionID }
      });
      payload.logger.info(
        tourFailed
          ? `[SEED] Problem occurred for ${tourFailed}/${seedData.tours.length} tours (count: ${tourCount})`
          : `[SEED] >> Tours up to date (count: ${tourCount})`
      );
      seedError = seedError || tourFailed > 0;
    }

    // SITE CONTENT

    // Everything a site is made of — pages, posts, media, tags, categories,
    // forms and navigation — is stated in one definition per tenant and
    // applied by the same code that fills a real workspace. So the seed is the
    // apply path's continuous proof rather than a second implementation of it
    if (!seedError) {
      let contentFailed = 0;

      for (const tenant of seedData.tenants) {
        const definition = definitionFor(tenant.slug);

        if (!definition) {
          // Content keys off the slug while everything else keys off the api
          // key, so a renamed tenant loses its whole site. Fail rather than
          // leave a workspace that looks seeded and is empty
          contentFailed++;
          payload.logger.error(
            `[SEED] No site definition for tenant '${tenant.slug}'. Its content was not seeded — check the slug against 'definitionFor'`
          );
          continue;
        }

        try {
          // Its own transaction, per tenant: the apply opens one and rolls it
          // back on any unresolved reference, so the seed must not be holding
          // another around it
          await endTransaction('commit');

          const report = await applySiteDefinition(payload, definition, {
            tenantSlug: tenant.slug,
            dryRun: false,
            locale: tenant.locale,
            // Deployed environments have no repository files; media comes from
            // the same place the rest of the seed data does
            mediaBaseUrl: remoteDataUrl
          });

          if (report.unresolved.length) {
            contentFailed++;
            payload.logger.error(
              `[SEED] '${tenant.slug}' has ${report.unresolved.length} reference(s) that lead nowhere, nothing was written:\n` +
                report.unresolved
                  .map(
                    ({ blockType, field, lookup }) =>
                      `  ${blockType}.${field} → '${lookup}'`
                  )
                  .join('\n')
            );
            continue;
          }

          const created = report.outcomes.filter(
            ({ action }) => action === 'created'
          ).length;
          payload.logger.info(
            `[SEED] Site '${tenant.slug}': ${created} created, ${report.outcomes.length - created} already there`
          );
        } catch (e) {
          contentFailed++;
          payload.logger.error((e as Error).message);
        }
      }

      payload.logger.info(
        contentFailed
          ? `[SEED] Problem occurred for ${contentFailed}/${seedData.tenants.length} sites`
          : '[SEED] >> Sites up to date'
      );
      seedError = seedError || contentFailed > 0;
    }

    // SITE SETTINGS

    // Create settings for each tenant
    if (seedData.tenants.length > 0) {
      await ensureTransaction();

      let siteSettingFailed = 0;

      for (const { apiKey } of seedData.tenants) {
        const [tenant] = store.lookupTenant(payload, [
          { lookupApiKey: apiKey }
        ]);

        // The definition created this page a moment ago, so it is read from the
        // database rather than the store, which only knows what the seed itself
        // made. Payload requires a landing page on the document
        const { docs: homePages } = await payload.find({
          collection: 'pages',
          where: {
            and: [{ slug: { equals: 'home' } }, { tenant: { in: [tenant.id] } }]
          },
          depth: 0,
          limit: 1,
          req: { transactionID }
        });
        const page = homePages.at(0)?.id;

        if (!page) {
          siteSettingFailed++;
          payload.logger.error(
            `[SEED] No home page for tenant '${tenant.slug}', cannot set its landing page`
          );
          continue;
        }
        try {
          const response = await ensureSiteSetting(
            payload,
            {
              // Standard footer for every tenant, with contacts that exercise
              // both click-to-copy paths and the release line
              footer: {
                contact: [
                  { platform: 'email', email: `hello@${tenant.slug}.dev` },
                  { platform: 'phone', phone: '+46 70 123 45 67' }
                ],
                enabled: true,
                linkSource: 'navigation',
                showVersion: true,
                tagline: tenant.description,
                variant: 'standard'
              },
              // Same demo address as the footer contact — the seeded contact
              // form leaves its own `emailTo` empty on purpose, to exercise
              // this exact fallback
              forms: {
                notificationRecipients: [{ email: `hello@${tenant.slug}.dev` }]
              },
              general: {
                appName: `${tenant.name} App`,
                icon: {
                  source: 'svg',
                  svgCode: generateSeedIcon(tenant.name, {
                    shape: 'circular',
                    style: 'tech',
                    techTheme: 'current'
                  })
                },
                landingPage: page,
                defaultLocale: tenant.locale,
                // Two themes so the seeded site exercises the theme selector;
                // spotlight is what tenants rendered before the setting existed
                themes: ['spotlight', 'codeware'],
                defaultTheme: 'spotlight',
                colorScheme: 'system',
                chrome: 'outlined'
              },
              tenant: tenant.id
            },
            { locale: tenant.locale, transactionID }
          );

          if (typeof response === 'object') {
            payload.logger.info(
              `[SEED] Site setting for tenant '${tenant.apiKey}' created (${tenant.locale})`
            );
          }
        } catch (e) {
          const error = e as Error;
          payload.logger.error(error.message);
          if ('data' in error) {
            payload.logger.error(
              `Site setting for tenant '${tenant.apiKey}'\n${JSON.stringify(
                error.data,
                null,
                2
              )}`
            );
          }
          siteSettingFailed++;
        }
      }
      const { totalDocs: siteSettingCount } = await payload.count({
        collection: 'site-settings',
        req: { transactionID }
      });
      payload.logger.info(
        siteSettingFailed
          ? `[SEED] Problem occurred for ${siteSettingFailed}/${seedData.tenants.length} site settings (count: ${siteSettingCount})`
          : `[SEED] >> Site settings up to date (count: ${siteSettingCount})`
      );
      seedError = seedError || siteSettingFailed > 0;
    }

    // FAQ

    if (seedData.faq.length > 0) {
      await ensureTransaction();
      let faqFailed = 0;

      for (const faq of seedData.faq) {
        try {
          const response = await ensureFaq(payload, faq, { transactionID });

          if (typeof response === 'object') {
            payload.logger.info(`[SEED] FAQ '${faq.question.en}'`);
          }
        } catch (e) {
          const error = e as Error;
          payload.logger.error(error.message);
          if ('data' in error) {
            payload.logger.error(
              `FAQ '${faq.question.en}'\n${JSON.stringify(error.data, null, 2)}`
            );
          }
          faqFailed++;
        }
      }
      const { totalDocs: faqCount } = await payload.count({
        collection: 'faq',
        req: { transactionID }
      });
      payload.logger.info(
        faqFailed
          ? `[SEED] Problem occurred for ${faqFailed}/${seedData.faq.length} FAQ entries (count: ${faqCount})`
          : `[SEED] >> FAQ up to date (count: ${faqCount})`
      );
      seedError = seedError || faqFailed > 0;
    }

    await endTransaction(seedError ? 'rollback' : 'commit');

    if (seedError) {
      payload.logger.warn(
        '[SEED] >> Seed completed with issues, check your data!'
      );
    } else {
      payload.logger.info('[SEED] >> Completed successfully');
    }
  } catch (error) {
    payload.logger.error((error as Error).message);
    payload.logger.error('[SEED] Something broke :(');
    await endTransaction('rollback');
    return false;
  }

  return true;
};

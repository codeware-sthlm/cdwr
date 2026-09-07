import { convertMarkdownToLexical } from '@codeware/app-cms/util/content-templates';
import type {
  SeedSource,
  SeedStrategy
} from '@codeware/app-cms/util/env-schema';
import { generateSeedIcon } from '@codeware/shared/ui/seed-icon-studio';
import type { Page } from '@codeware/shared/util/payload-types';
import { randPassword } from '@ngneat/falso';
import type { Payload } from 'payload';

import { loadInfisicalData } from './load-infisical-data';
import { loadStaticData } from './load-static-data';
import { customSeed } from './local-api/custom-seed';
import { ensureCategory } from './local-api/ensure-category';
import { ensureFaq } from './local-api/ensure-faq';
import { ensureMedia } from './local-api/ensure-media';
import { ensureNavigation } from './local-api/ensure-navigation';
import { ensurePage } from './local-api/ensure-page';
import { ensurePlace } from './local-api/ensure-place';
import { ensurePlatformLabel } from './local-api/ensure-platform-label';
import { ensurePlatformSettings } from './local-api/ensure-platform-settings';
import { ensurePost } from './local-api/ensure-post';
import { ensureSiteSetting } from './local-api/ensure-site-setting';
import { ensureStockMedia } from './local-api/ensure-stock-media';
import { ensureTag } from './local-api/ensure-tag';
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
import {
  lookupCategory,
  lookupPage,
  lookupPlace,
  lookupStockMedia,
  lookupTag,
  lookupTenant,
  lookupUser,
  tempStore
} from './utils/temp-store';

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
        tempStore.tenant(tenant.apiKey, { ...tenant, id: tenantId });
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
        const tenants = lookupTenant(payload, user.tenants);

        try {
          const password =
            user.password ||
            (environment === 'development'
              ? 'dev'
              : environment === 'preview'
                ? 'pallevante'
                : // Production will not happen, but just in case
                  randPassword().toString());

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
          tempStore.user(user.email, userId);
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

    // CATEGORIES

    if (seedData.categories.length > 0) {
      let categoryFailed = 0;

      for (const category of seedData.categories) {
        const [entity] = lookupTenant(payload, [category.tenant]);

        try {
          const response = await ensureCategory(
            payload,
            {
              name: category.name,
              slug: category.slug,
              tenant: entity.id
            },
            { locale: entity.locale, transactionID }
          );

          let categoryId: number;
          if (typeof response === 'object') {
            payload.logger.info(
              `[SEED] Category '${category.slug}' on tenant #${entity.id} (${entity.locale})`
            );
            categoryId = response.id;
          } else {
            categoryId = Number(response);
          }
          // Save category to map to lookup id's later
          tempStore.category(
            { apiKey: category.tenant.lookupApiKey, slug: category.slug },
            categoryId
          );
        } catch (e) {
          const error = e as Error;
          payload.logger.error(error.message);
          if ('data' in error) {
            payload.logger.error(
              `Category '${category.slug}'\n${JSON.stringify(error.data, null, 2)}`
            );
          }
          categoryFailed++;
        }
      }
      const { totalDocs: categoryCount } = await payload.count({
        collection: 'categories',
        req: { transactionID }
      });
      payload.logger.info(
        categoryFailed
          ? `[SEED] Problem occurred for ${categoryFailed}/${seedData.categories.length} categories (count: ${categoryCount})`
          : `[SEED] >> Categories up to date (count: ${categoryCount})`
      );
      seedError = seedError || categoryFailed > 0;
    }

    // TAGS

    if (seedData.tags.length > 0) {
      let tagFailed = 0;

      for (const tag of seedData.tags) {
        const [entity] = lookupTenant(payload, [tag.tenant]);

        try {
          const response = await ensureTag(
            payload,
            {
              brand: tag.brand,
              name: tag.name,
              slug: tag.slug,
              tenant: entity.id
            },
            { locale: entity.locale, transactionID }
          );

          let tagId: number;
          if (typeof response === 'object') {
            payload.logger.info(
              `[SEED] Tag '${tag.slug}' on tenant #${entity.id} (${entity.locale})`
            );
            tagId = response.id;
          } else {
            tagId = Number(response);
          }
          // Save tag to map to lookup id's later
          tempStore.tag(
            { apiKey: tag.tenant.lookupApiKey, slug: tag.slug },
            tagId
          );
        } catch (e) {
          const error = e as Error;
          payload.logger.error(error.message);
          if ('data' in error) {
            payload.logger.error(
              `Tag '${tag.slug}'\n${JSON.stringify(error.data, null, 2)}`
            );
          }
          tagFailed++;
        }
      }
      const { totalDocs: tagCount } = await payload.count({
        collection: 'tags',
        req: { transactionID }
      });
      payload.logger.info(
        tagFailed
          ? `[SEED] Problem occurred for ${tagFailed}/${seedData.tags.length} tags (count: ${tagCount})`
          : `[SEED] >> Tags up to date (count: ${tagCount})`
      );
      seedError = seedError || tagFailed > 0;
    }

    // PAGES

    if (seedData.pages.length > 0) {
      let pageFailed = 0;

      for (const page of seedData.pages) {
        const [entity] = lookupTenant(payload, [page.tenant]);

        try {
          const layout: Page['layout'] = [];

          if (page.hero) {
            layout.push({
              blockType: 'hero',
              badge: page.hero.badge,
              heading: page.hero.heading,
              lede: page.hero.lede,
              actions: page.hero.actions?.map(({ link, emphasis }) => ({
                link: {
                  type: 'custom' as const,
                  url: link.url,
                  label: link.label,
                  newTab: link.newTab ?? false
                },
                emphasis: emphasis ?? 'primary'
              }))
            });
          }

          if (page.layoutContent) {
            layout.push({
              blockType: 'content',
              columns: [
                {
                  size: 'full',
                  richText: await convertMarkdownToLexical(
                    payload.config,
                    page.layoutContent
                  )
                }
              ]
            });
          }

          if (page.featureCards) {
            layout.push({
              blockType: 'feature-cards',
              eyebrow: page.featureCards.eyebrow,
              heading: page.featureCards.heading,
              intro: page.featureCards.intro,
              columns: page.featureCards.columns ?? 'auto',
              items: page.featureCards.items ?? []
            });
          }

          if (page.callout) {
            layout.push({
              blockType: 'callout',
              showMark: page.callout.showMark ?? true,
              heading: page.callout.heading,
              body: page.callout.body,
              link: {
                type: 'custom' as const,
                url: page.callout.link.url,
                label: page.callout.link.label,
                newTab: page.callout.link.newTab ?? false
              }
            });
          }

          const response = await ensurePage(
            payload,
            {
              header: page.header,
              layout,
              name: page.name,
              slug: page.slug,
              tenant: entity.id
            },
            { locale: entity.locale, transactionID }
          );

          let pageId: number;
          if (typeof response === 'object') {
            payload.logger.info(
              `[SEED] Page '${page.slug}' on tenant #${entity.id} (${entity.locale})`
            );
            pageId = response.id;
          } else {
            pageId = Number(response);
          }
          // Save page to map to lookup id's later
          tempStore.page(
            { apiKey: page.tenant.lookupApiKey, slug: page.slug },
            pageId
          );
        } catch (e) {
          const error = e as Error;
          payload.logger.error(error.message);
          if ('data' in error) {
            payload.logger.error(
              `Page '${page.slug}'\n${JSON.stringify(error.data, null, 2)}`
            );
          }
          pageFailed++;
        }
      }
      const { totalDocs: pageCount } = await payload.count({
        collection: 'pages',
        req: { transactionID }
      });
      payload.logger.info(
        pageFailed
          ? `[SEED] Problem occurred for ${pageFailed}/${seedData.pages.length} pages (count: ${pageCount})`
          : `[SEED] >> Pages up to date (count: ${pageCount})`
      );
      seedError = seedError || pageFailed > 0;
    }

    // !! COMMIT POINT !!
    // Need to commit since the collections that follow require previous seed data
    await endTransaction(seedError ? 'rollback' : 'commit');

    // MEDIA

    // Only seed media when no errors occurred
    if (!seedError && seedData.media.length > 0) {
      await ensureTransaction();

      let mediaFailed = 0;

      for (const media of seedData.media) {
        const tags = lookupTag(
          payload,
          media.tags.map(({ lookupSlug }) => ({
            apiKey: media.tenant.lookupApiKey,
            slug: lookupSlug
          }))
        );
        const [entity] = lookupTenant(payload, [media.tenant]);

        try {
          const response = await ensureMedia(
            payload,
            {
              alt: media.alt,
              external: media.external,
              filename: media.filename,
              filePath: media.filePath,
              tags,
              tenant: entity.id
            },
            { locale: entity.locale, transactionID }
          );

          let mediaId: number;
          if (typeof response === 'object') {
            payload.logger.info(
              `[SEED] Media '${media.filename}' on tenant #${entity.id} (${entity.locale})`
            );
            mediaId = response.id;
          } else {
            mediaId = Number(response);
          }
          // Save media to map to lookup id's later
          tempStore.media(
            { apiKey: media.tenant.lookupApiKey, slug: media.filename },
            mediaId
          );
        } catch (e) {
          const error = e as Error;
          payload.logger.error(error.message);
          if ('data' in error) {
            payload.logger.error(
              `Media '${media.filePath}'\n${JSON.stringify(error.data, null, 2)}`
            );
          }
          mediaFailed++;
        }
      }
      const { totalDocs: mediaCount } = await payload.count({
        collection: 'media',
        req: { transactionID }
      });
      payload.logger.info(
        mediaFailed
          ? `[SEED] Problem occurred for ${mediaFailed}/${seedData.media.length} media (count: ${mediaCount})`
          : `[SEED] >> Media up to date (count: ${mediaCount})`
      );
      seedError = seedError || mediaFailed > 0;
    }

    // POSTS

    // Only seed posts when no errors occurred
    if (!seedError && seedData.posts.length > 0) {
      await ensureTransaction();

      let postFailed = 0;

      for (const post of seedData.posts) {
        const categories = lookupCategory(
          payload,
          post.categories.map(({ lookupSlug }) => ({
            apiKey: post.tenant.lookupApiKey,
            slug: lookupSlug
          }))
        );
        const [entity] = lookupTenant(payload, [post.tenant]);
        const authors = lookupUser(payload, post.authors);

        try {
          const response = await ensurePost(
            payload,
            {
              authors,
              categories,
              content: await convertMarkdownToLexical(
                payload.config,
                post.content
              ),
              createdAt: post.createdAt,
              slug: post.slug,
              title: post.title,
              tenant: entity.id
            },
            { locale: entity.locale, transactionID }
          );

          if (typeof response === 'object') {
            payload.logger.info(
              `[SEED] Post '${post.slug}' on tenant #${entity.id} (${entity.locale})`
            );
          }
        } catch (e) {
          const error = e as Error;
          payload.logger.error(error.message);
          if ('data' in error) {
            payload.logger.error(
              `Post '${post.slug}'\n${JSON.stringify(error.data, null, 2)}`
            );
          }
          postFailed++;
        }
      }
      const { totalDocs: postCount } = await payload.count({
        collection: 'posts',
        req: { transactionID }
      });
      payload.logger.info(
        postFailed
          ? `[SEED] Problem occurred for ${postFailed}/${seedData.posts.length} posts (count: ${postCount})`
          : `[SEED] >> Posts up to date (count: ${postCount})`
      );
      seedError = seedError || postFailed > 0;
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
          tempStore.stockMedia(stock.filename, stockId);
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
        const [entity] = lookupTenant(payload, [place.tenant]);
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
          tempStore.place(
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
        const [entity] = lookupTenant(payload, [tour.tenant]);
        const heroImage = lookupStockMedia(payload, tour.heroImage);

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
                places: lookupPlace(
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

    // NAVIGATION

    // Create navigation for each tenant using the first 5 tenant pages excluding the home page
    if (seedData.tenants.length > 0) {
      await ensureTransaction();

      let navigationFailed = 0;

      for (const tenant of seedData.tenants) {
        const [tenantEntity] = lookupTenant(payload, [
          { lookupApiKey: tenant.apiKey }
        ]);
        // Lookup the first 5 tenant pages excluding the home page
        const pageIds = lookupPage(
          payload,
          seedData.pages
            .filter(
              ({ slug, tenant: { lookupApiKey } }) =>
                lookupApiKey === tenant.apiKey && slug !== 'home'
            )
            .map(({ slug, tenant: { lookupApiKey } }) => ({
              apiKey: lookupApiKey,
              slug
            }))
            .slice(0, 5)
        );

        try {
          const { navigation, items } = await ensureNavigation(
            payload,
            {
              items: pageIds.map((id) => ({
                reference: { relationTo: 'pages', value: id }
              })),
              tenant: tenantEntity.id
            },
            { locale: tenantEntity.locale, transactionID }
          );

          if (typeof navigation === 'object') {
            payload.logger.info(
              `[SEED] Navigation with ${items.length} items for tenant '${tenant.apiKey}' created (${tenantEntity.locale})`
            );
          }
        } catch (e) {
          const error = e as Error;
          payload.logger.error(error.message);
          if ('data' in error) {
            payload.logger.error(
              `Navigation for tenant '${tenant.apiKey}'\n${JSON.stringify(error.data, null, 2)}`
            );
          }
          navigationFailed++;
        }
      }
      const { totalDocs: navigationCount } = await payload.count({
        collection: 'navigation',
        req: { transactionID }
      });
      payload.logger.info(
        navigationFailed
          ? `[SEED] Problem occurred for ${navigationFailed}/${seedData.tenants.length} navigations (count: ${navigationCount})`
          : `[SEED] >> Navigations up to date (count: ${navigationCount})`
      );
      seedError = seedError || navigationFailed > 0;
    }

    // SITE SETTINGS

    // Create settings for each tenant
    if (seedData.tenants.length > 0) {
      await ensureTransaction();

      let siteSettingFailed = 0;

      for (const { apiKey } of seedData.tenants) {
        const [tenant] = lookupTenant(payload, [{ lookupApiKey: apiKey }]);
        // Landing page is "home" page
        const [page] = lookupPage(payload, [{ apiKey, slug: 'home' }]);

        if (!page) {
          siteSettingFailed++;
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

    // CUSTOM SEED

    // Only run when no errors occurred
    if (!seedError) {
      await ensureTransaction();
      try {
        await customSeed(payload, { transactionID });
      } catch (e) {
        const error = e as Error;
        payload.logger.error(error.message);
        if ('data' in error) {
          payload.logger.error(
            `Custom seed error\n${JSON.stringify(error.data, null, 2)}`
          );
        }
        seedError = true;
      }
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

import { randomBytes } from 'crypto';

import type {
  SeedSource,
  SeedStrategy
} from '@codeware/app-cms/util/env-schema';
import { getId } from '@codeware/app-cms/util/misc';
import type { TenantRole } from '@codeware/shared/util/payload-types';
import type { Payload } from 'payload';

import { applySiteDefinition } from './apply-site-definition';
import { definitionFor } from './definition-for';
import { loadStaticData } from './load-static-data';
import { ensureFaq } from './local-api/ensure-faq';
import { ensurePlatformLabel } from './local-api/ensure-platform-label';
import { ensurePlatformSettings } from './local-api/ensure-platform-settings';
import { ensureStockMedia } from './local-api/ensure-stock-media';
import { ensureTenant } from './local-api/ensure-tenant';
import { ensureTourSignups } from './local-api/ensure-tour-signups';
import { ensureUser } from './local-api/ensure-user';
import type {
  SeedData,
  SeedEnvironment,
  StaticSeedOptions,
  TenantDataLookup
} from './seed-types';
import {
  labelIcon,
  splitLabelKey,
  usedLabelsSorted
} from './utils/platform-label-icons';

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
  // Tenant ids recorded as they are created, read back when users and site
  // content reference them by api key. Scoped to this run — a second run in
  // the same process would otherwise resolve against the first one's ids
  const tenantsByApiKey = new Map<string, TenantDataLookup & { id: number }>();

  /** The tenant for one api key, logging and skipping when it is missing. */
  const findTenant = (apiKey: string) => {
    const tenant = tenantsByApiKey.get(apiKey);
    if (!tenant) {
      payload.logger.error(`Skip: Tenant '${apiKey}' not found`);
    }
    return tenant;
  };

  /** The tenants a user belongs to, each with its role, by api key. */
  const findTenants = (
    refs: ReadonlyArray<{ lookupApiKey: string; role: TenantRole }>
  ) =>
    refs.flatMap(({ lookupApiKey, role }) => {
      const tenant = findTenant(lookupApiKey);
      return tenant ? [{ ...tenant, role }] : [];
    });

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

    // Production is never seeded, whatever the source says
    if (environment === 'production') {
      payload.logger.warn(
        `[SEED] Seeding is not done in ${environment}, skip seeding`
      );
      return true;
    }

    payload.logger.info('[SEED] Seed started');

    // Preview has no repository files, so it is the only environment that
    // downloads media; every other environment uses the bundled local files
    const mediaUrl = environment === 'preview' ? remoteDataUrl : undefined;

    const seedData: SeedData | null = loadStaticData({
      environment,
      payload,
      options: { remoteDataUrl: mediaUrl }
    });

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
        tenantsByApiKey.set(tenant.apiKey, { ...tenant, id: tenantId });
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
        const tenants = findTenants(user.tenants);

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

          if (typeof response === 'object') {
            payload.logger.info(
              `[SEED] User '${user.name}' (${user.locale}) on tenants ${
                tenants.map(({ id, role }) => `#${id} (${role})`).join(', ') ||
                '<none>'
              }`
            );
          }
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
    // media and the site content apply, which resolve their labels by name.
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
        // Place kinds come from the site definitions that state the places
        ...new Set(
          seedData.tenants
            .flatMap((tenant) => definitionFor(tenant.slug)?.places ?? [])
            .map(({ kind }) => labelKey('place-kind', kind))
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

          if (typeof response === 'object') {
            payload.logger.info(`[SEED] Stock image '${stock.filename}'`);
          }
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

    // SITE CONTENT

    // Everything a site is made of — pages, posts, media, tags, categories,
    // forms, navigation, places and tours — is stated in one definition per tenant and
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
            mediaBaseUrl: mediaUrl
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

    // TOUR CAPACITY AND SIGNUPS

    // Demo data rather than site structure, so it stays imperative: a maximum
    // and a signup list give the fill bar, the waiting queue and the promote
    // button something to show in development. Tours themselves now come
    // from the site content just applied, so this reads them back from the
    // database rather than from a fixture
    if (!seedError) {
      await ensureTransaction();

      const { docs: tourDocs } = await payload.find({
        collection: 'tours',
        depth: 0,
        limit: 0,
        pagination: false,
        req: { transactionID }
      });

      // Resolved once; the loop runs per tour
      const localeById = new Map<
        number,
        (typeof seedData.tenants)[number]['locale']
      >();
      for (const { apiKey } of seedData.tenants) {
        const entity = findTenant(apiKey);
        if (entity) {
          localeById.set(entity.id, entity.locale);
        }
      }

      let signupFailed = 0;

      for (const tour of tourDocs) {
        const tenantId = getId(tour.tenant);

        try {
          if (!tour.maxCustomers) {
            await payload.update({
              collection: 'tours',
              id: tour.id,
              data: { maxCustomers: 12 },
              context: { seedAction: true },
              // Tours carry localized required fields. Without the tenant's
              // own locale the update lands on the default one, where those
              // are empty — and validation refuses a tour with no title
              locale: localeById.get(tenantId),
              req: { transactionID }
            });
          }

          const created = await ensureTourSignups(
            payload,
            { tour: tour.id, tenant: tenantId },
            { transactionID }
          );

          if (created) {
            payload.logger.info(
              `[SEED] ${created} signups on tour #${tour.id} for tenant #${tenantId}`
            );
          }
        } catch (e) {
          payload.logger.error((e as Error).message);
          signupFailed++;
        }
      }

      payload.logger.info(
        signupFailed
          ? `[SEED] Problem occurred for ${signupFailed}/${tourDocs.length} tours`
          : '[SEED] >> Tour capacity and signups up to date'
      );
      seedError = seedError || signupFailed > 0;
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

import type {
  SeedSource,
  SeedStrategy
} from '@codeware/app-cms/util/env-schema';
import { getId } from '@codeware/app-cms/util/misc';
import { platform } from '@codeware/shared/util/seed';
import type { Payload } from 'payload';

import { applyPlatformDefinition } from './apply-platform-definition';
import { applySiteDefinition } from './apply-site-definition';
import { SITE_BY_TENANT } from './definition-for';
import { ensureTourSignups } from './local-api/ensure-tour-signups';

export type SeedEnvironment = 'development' | 'preview' | 'production';

/**
 * Seed Payload collections.
 *
 * The seed process is designed to only make changes when needed.
 * It can run multiple times without creating duplicates.
 *
 * Orchestration only: the platform definition is applied first — its
 * tenants, users, labels, stock media and FAQ — then each tenant's own site
 * definition, then the tour capacity and signups fixture.
 *
 * Applies run in a transaction; one that cannot start one refuses.
 *
 * @returns `true` if seeding was successful or skipped for a reason, otherwise `false`
 * @throws Never - just logs errors
 */
export const seed = async (args: {
  environment: SeedEnvironment;
  payload: Payload;
  remoteDataUrl: string | undefined;
  source: SeedSource;
  strategy: SeedStrategy;
}): Promise<boolean> => {
  const { environment, payload, remoteDataUrl, source, strategy } = args;

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
    const password = environment === 'preview' ? 'pallevante' : 'dev';

    // PLATFORM

    // Tenants, users, platform labels, stock media and the FAQ — everything
    // no single site owns
    const platformReport = await applyPlatformDefinition(payload, platform, {
      password,
      mediaBaseUrl: mediaUrl
    });

    if (platformReport.unresolved.length) {
      // The sites resolve place kinds and hero images against what was just
      // rolled back, so they would only fail one by one
      payload.logger.error(
        `[SEED] Platform has ${platformReport.unresolved.length} reference(s) that lead nowhere; everything but tenants was rolled back:\n` +
          platformReport.unresolved
            .map(
              ({ blockType, field, lookup }) =>
                `  ${blockType}.${field} → '${lookup}'`
            )
            .join('\n')
      );
      payload.logger.warn(
        '[SEED] >> Seed completed with issues, check your data!'
      );
      return true;
    }

    const platformCreated = platformReport.outcomes.filter(
      ({ action }) => action === 'created'
    ).length;
    payload.logger.info(
      `[SEED] >> Platform: ${platformCreated} created, ${platformReport.outcomes.length - platformCreated} already there`
    );

    // SITES

    // Everything a site is made of — pages, posts, media, tags, categories,
    // forms, navigation, places and tours — is stated in one definition per
    // tenant and applied by the same code that fills a real workspace. So the
    // seed is the apply path's continuous proof rather than a second
    // implementation of it
    let contentFailed = 0;

    for (const tenant of platform.tenants) {
      const definition = SITE_BY_TENANT[tenant.slug];

      try {
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
        ? `[SEED] Problem occurred for ${contentFailed}/${platform.tenants.length} sites`
        : '[SEED] >> Sites up to date'
    );

    let hadIssues = contentFailed > 0;

    // TOUR CAPACITY AND SIGNUPS

    // Demo data rather than site structure, so it stays imperative: a maximum
    // and a signup list give the fill bar, the waiting queue and the promote
    // button something to show. Tours come from the site content just applied,
    // so they are read back from the database
    const transactionID = await payload.db.beginTransaction();
    if (transactionID === null || transactionID === undefined) {
      throw new Error(
        'The database adapter started no transaction. Refusing to apply.'
      );
    }

    try {
      const { docs: tourDocs } = await payload.find({
        collection: 'tours',
        depth: 0,
        limit: 0,
        pagination: false,
        req: { transactionID }
      });

      // The tenant locale a tour's own update must write in, by id — resolved
      // once from the platform apply, which is the only place id and locale
      // meet
      const localeById = new Map(
        [...platformReport.tenants.values()].map(({ id, locale }) => [
          id,
          locale
        ])
      );

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
      hadIssues = hadIssues || signupFailed > 0;

      await payload.db.commitTransaction(transactionID);
    } catch (error) {
      await payload.db.rollbackTransaction(transactionID);
      throw error;
    }

    if (hadIssues) {
      payload.logger.warn(
        '[SEED] >> Seed completed with issues, check your data!'
      );
    } else {
      payload.logger.info('[SEED] >> Completed successfully');
    }
  } catch (error) {
    payload.logger.error((error as Error).message);
    payload.logger.error('[SEED] Something broke :(');
    return false;
  }

  return true;
};

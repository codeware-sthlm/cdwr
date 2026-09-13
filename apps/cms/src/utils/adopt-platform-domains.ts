import { adoptableDomains } from '@codeware/app-cms/feature/domains';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import type { Payload } from 'payload';

import { isSchemaNotReady } from './schema-not-ready';

/**
 * Serve the host cms on its own custom domain.
 *
 * The mirror of `adoptTenantDomains`, one level up: the host app's domain
 * lives in `platform-settings` rather than a tenant document, for the same
 * reason — the database is what the config is being built to reach, so this
 * runs from `onInit` instead of being read into `buildConfig`.
 *
 * Host mode only. A tenant deployment's own domain comes from its tenant row;
 * applying the platform's host domain there would put it on the wrong app's
 * identity, not just leave it unused.
 *
 * No spec, for the same reason `adoptTenantDomains` has none: importing this
 * file drags in `@codeware/app-cms/feature/domains`'s barrel, which re-exports
 * `guardDomainConflicts`, which imports `payload` as a value — and jest can't
 * parse Payload's ESM build. Covered instead by `nx verify cms` and manual
 * checks in the admin.
 */
export const adoptPlatformDomains = async (payload: Payload): Promise<void> => {
  const { config } = payload;

  try {
    const env = getEnv();

    if (env.APP_MODE.type !== 'host') {
      return;
    }

    const { docs } = await payload.find({
      collection: 'platform-settings',
      depth: 0,
      limit: 1,
      pagination: false,
      overrideAccess: true
    });

    const { primary, origins } = adoptableDomains(
      docs[0]?.domains,
      env.APP_NAME
    );

    // Said out loud rather than returned quietly. The app still works on its
    // Fly url in this state, so nothing looks wrong until someone reaches it
    // on the domain they expected to have been adopted
    if (!origins.length) {
      payload.logger.warn(
        `[platform-domains] No adoptable domain for ${env.APP_NAME}, serving as ${config.serverURL} — the platform settings row needs a hostname on this app with a configured certificate`
      );
      return;
    }

    if (!primary) {
      payload.logger.warn(
        `[platform-domains] No domain marked primary, serving as ${config.serverURL}`
      );
    }

    // The break-glass DISABLE_DOMAIN_ADOPTION flag is the escape hatch: set
    // it and the app comes back on its known-good Fly url, and the row can
    // be fixed from there
    if (primary && !env.DISABLE_DOMAIN_ADOPTION) {
      config.serverURL = primary;
      payload.logger.info(`[platform-domains] Serving as ${primary}`);
    }

    // A wildcard already allows these, and narrowing it here would quietly
    // tighten a deployment that chose to be open
    if (Array.isArray(config.cors)) {
      config.cors = [...new Set([...config.cors, ...origins])];
    }

    // The Fly url stays on the list beside the adopted domain — it is how
    // support reaches an app whose custom domain is what went wrong
    config.csrf = [
      ...new Set([...(config.csrf ?? []), env.FLY_URL, ...origins])
    ].filter(Boolean);

    payload.logger.info(`[platform-domains] Accepting ${origins.join(', ')}`);
  } catch (error) {
    if (isSchemaNotReady(error)) {
      payload.logger.warn(
        '[platform-domains] Skipped, the database schema is not ready'
      );
      return;
    }

    // A settings lookup failing must not stop the app from booting — without
    // this it still serves on its Fly url, which is how support reaches it
    payload.logger.error(
      `[platform-domains] Could not apply custom domain: ${String(error)}`
    );
  }
};

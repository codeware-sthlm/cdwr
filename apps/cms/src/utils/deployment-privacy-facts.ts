import { getEnv } from '@codeware/app-cms/feature/env-loader';
import type { LegalTemplateVars } from '@codeware/app-cms/util/content-templates';

/** Sentry's EU region, read from the DSN host rather than matched anywhere in the string */
const isEuSentryHost = (dsn: string | undefined): boolean => {
  if (!dsn) {
    return false;
  }
  try {
    const { hostname } = new URL(dsn);
    return hostname === 'de.sentry.io' || hostname.endsWith('.de.sentry.io');
  } catch {
    return false;
  }
};

/**
 * What this deployment does with a visitor's details, as a privacy text must
 * state it: the services that are switched on, never assumed off.
 *
 * @param statsWebsiteId - The workspace's statistics site, if it has one
 */
export function deploymentPrivacyFacts(
  statsWebsiteId: string | null | undefined
): Pick<
  LegalTemplateVars,
  | 'humanCheck'
  | 'sendgrid'
  | 'errorMonitoring'
  | 'errorMonitoringEu'
  | 'analytics'
> {
  const { EMAIL, HUMAN_CHECK, SENTRY, UMAMI_URL } = getEnv();

  return {
    humanCheck: Boolean(HUMAN_CHECK),
    sendgrid: Boolean(EMAIL && 'sendgrid' in EMAIL),
    errorMonitoring: Boolean(SENTRY),
    errorMonitoringEu: isEuSentryHost(SENTRY?.dsn),
    // Statistics run only with both set, the same rule as the site's script
    analytics: Boolean(UMAMI_URL && statsWebsiteId)
  };
}

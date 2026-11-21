/**
 * Every variable a deploy build needs to upload source maps to Sentry.
 *
 * Org and auth token reach every app, so gating on those alone would arm the
 * plugin for an app with no Sentry configuration, uploading to an undefined
 * project and a release that was never created. The release is created by the
 * build workflow; the plugin only attaches artifacts to it.
 */
export const SENTRY_UPLOAD_VARIABLES = [
  'SENTRY_AUTH_TOKEN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
  'SENTRY_RELEASE',
  'SENTRY_DSN'
] as const;

/**
 * Whether this build makes source maps and uploads them: only when the deploy
 * supplies every variable. Without them the build makes no maps at all.
 */
export const sentryUploadEnabled = (
  env: Record<string, string | undefined>
): boolean => SENTRY_UPLOAD_VARIABLES.every((key) => !!env[key]);

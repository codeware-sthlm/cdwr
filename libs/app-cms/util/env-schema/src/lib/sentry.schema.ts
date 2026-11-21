import { z } from 'zod';

/**
 * Sentry environment schema with necessary configuration variables
 * for server-side error tracking.
 */
export const SentrySchema = z.object({
  SENTRY_DSN: z
    .string()
    .describe('Data Source Name - Sentry project identifier'),
  SENTRY_ORG: z.string().describe('Sentry organization slug'),
  SENTRY_RELEASE: z
    .string()
    .optional()
    .describe('Sentry release version identifier when available')
});

export type Sentry = z.infer<typeof SentrySchema>;

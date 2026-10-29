import { getSentrySampleRate } from '@codeware/shared/util/pure';
import type { ErrorEvent } from '@sentry/tanstackstart-react';
import { isbot } from 'isbot';

export type SentryConfig = {
  dsn?: string;
  environment?: string;
  release?: string;
};

/**
 * Drops events from crawlers. Bots trigger false positives: stale HTML that
 * references chunks gone after a deploy, a machine waking from suspend,
 * crawling patterns no visitor has.
 */
export function dropBotEvent(event: ErrorEvent): ErrorEvent | null {
  // The browser SDK sends `User-Agent`, the server the request's own headers
  const userAgent =
    event.request?.headers?.['User-Agent'] ??
    event.request?.headers?.['user-agent'] ??
    '';

  return userAgent && isbot(userAgent) ? null : event;
}

/**
 * The options client and server share, as the cms sets them. Off without a DSN.
 * No Session Replay: it records the screen and keeps state in the visitor's
 * browser, which would need consent on every public site.
 */
export const sentryOptions = ({ dsn, environment, release }: SentryConfig) => ({
  enabled: !!dsn,
  dsn,
  environment,
  release,
  tracesSampleRate: getSentrySampleRate(environment),
  beforeSend: dropBotEvent
});

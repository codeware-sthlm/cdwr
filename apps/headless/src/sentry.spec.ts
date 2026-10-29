import type { ErrorEvent } from '@sentry/tanstackstart-react';

import { dropBotEvent, sentryOptions } from './sentry';

const withUserAgent = (header: string, userAgent: string) =>
  ({
    type: undefined,
    request: { headers: { [header]: userAgent } }
  }) as ErrorEvent;

const browser =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const crawler =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

describe('dropBotEvent', () => {
  it.each(['User-Agent', 'user-agent'])('drops a crawler by %s', (header) => {
    expect(dropBotEvent(withUserAgent(header, crawler))).toBeNull();
  });

  it('keeps a browser', () => {
    const event = withUserAgent('User-Agent', browser);
    expect(dropBotEvent(event)).toBe(event);
  });

  it('keeps an event without a user agent', () => {
    const event = { type: undefined } as ErrorEvent;
    expect(dropBotEvent(event)).toBe(event);
  });
});

describe('sentryOptions', () => {
  it('is off without a DSN', () => {
    expect(sentryOptions({ environment: 'production' }).enabled).toBe(false);
  });

  it('carries the DSN, environment and release', () => {
    expect(
      sentryOptions({
        dsn: 'https://key@o1.ingest.sentry.io/1',
        environment: 'preview',
        release: 'headless@1.0.0+abc1234'
      })
    ).toMatchObject({
      enabled: true,
      dsn: 'https://key@o1.ingest.sentry.io/1',
      environment: 'preview',
      release: 'headless@1.0.0+abc1234',
      tracesSampleRate: 0.5,
      beforeSend: dropBotEvent
    });
  });
});

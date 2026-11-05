// Any header that carries a credential or identifies the visitor goes in this
// list. Log sites print headers only through `loggable`
const REDACTED = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-signature',
  'x-api-key',
  'fly-client-ip',
  'x-forwarded-for',
  'x-real-ip',
  'cf-connecting-ip',
  'true-client-ip',
  'forwarded'
];

// Headers holding a url print it through `loggableUrl`
const URLS = ['referer', 'location', 'content-location'];

/** The url without its query string and hash, which can carry tokens or personal data. */
const loggableUrl = (url: string): string => {
  try {
    const { origin, pathname } = new URL(url);
    return `${origin}${pathname}`;
  } catch {
    return '[unparseable url]';
  }
};

const loggable = (headers: Headers): Record<string, string> =>
  Object.fromEntries(
    [...headers.entries()].map(([name, value]) => [
      name,
      REDACTED.includes(name)
        ? '[redacted]'
        : URLS.includes(name)
          ? loggableUrl(value)
          : value
    ])
  );

/**
 * Log a request's and its response's headers, credentials and visitor
 * addresses masked, and the url without its query.
 *
 * Activate by setting `DEBUG` to `true` in the environment variables.
 */
export const logRequestHeaders = (request: Request): void => {
  console.log(
    `[INCOMING] Request ${request.method} ${loggableUrl(request.url)}`
  );
  console.log(
    '[INCOMING] Headers:\n',
    JSON.stringify(loggable(request.headers), null, 2)
  );
};

export const logResponseHeaders = (response: Response): void => {
  console.log(
    '[OUTGOING] Response headers:\n',
    JSON.stringify(loggable(response.headers), null, 2)
  );
};

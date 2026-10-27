const REDACTED = ['authorization', 'cookie', 'set-cookie', 'x-signature'];

const loggable = (headers: Headers): Record<string, string> =>
  Object.fromEntries(
    [...headers.entries()].map(([name, value]) => [
      name,
      REDACTED.includes(name) ? '[redacted]' : value
    ])
  );

/**
 * Log a request's and its response's headers, credentials masked.
 *
 * Activate by setting `DEBUG` to `true` in the environment variables.
 */
export const logRequestHeaders = (request: Request): void => {
  console.log(`[INCOMING] Request ${request.method} ${request.url}`);
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

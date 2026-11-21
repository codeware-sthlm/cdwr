/**
 * An error's class and `code`, for a log line about a visitor's submission.
 *
 * Messages from the database (Drizzle's `Failed query: … params: …`, the
 * driver's `detail`) or the mail transport carry what the visitor submitted,
 * so a route that logs a failed submission logs this instead of the message.
 */
export const errorKind = (error: unknown): string => {
  // `name` survives a minified server bundle where a class name may not
  const name =
    error instanceof Error
      ? error.name !== 'Error'
        ? error.name
        : error.constructor.name
      : typeof error;
  const code =
    error && typeof error === 'object' && 'code' in error
      ? ` ${String(error.code)}`
      : '';
  return `${name}${code}`;
};

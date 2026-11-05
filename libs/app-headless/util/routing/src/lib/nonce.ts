/** The nonce the security middleware put on the request context, if any */
export function nonceFrom(context: unknown): string | undefined {
  if (typeof context !== 'object' || context === null) {
    return undefined;
  }

  return 'nonce' in context && typeof context.nonce === 'string'
    ? context.nonce
    : undefined;
}

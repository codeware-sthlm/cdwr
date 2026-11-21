/**
 * Auth headers for a Supabase REST call. A new `sb_secret_` or `sb_publishable_` key is not a JWT and
 * must never be sent as a Bearer token; only a legacy JWT key (`eyJ…`) is also sent as one.
 */
export function keyHeaders(key: string): Record<string, string> {
  return key.startsWith('eyJ')
    ? { apikey: key, Authorization: `Bearer ${key}` }
    : { apikey: key };
}

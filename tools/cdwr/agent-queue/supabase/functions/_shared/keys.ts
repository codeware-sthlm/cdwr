// Web APIs only, so the same file runs in Deno on Supabase and under vitest

/**
 * The key a function calls its own project's REST API with: the `default` entry of
 * SUPABASE_SECRET_KEYS (a JSON object of name to key the platform injects), else the legacy
 * SUPABASE_SERVICE_ROLE_KEY. Invalid JSON or a missing entry falls back.
 */
export const serviceKey = (
  env: (name: string) => string | undefined
): string | undefined => {
  const raw = env('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const entry: unknown = (
        JSON.parse(raw) as Record<string, unknown> | null
      )?.['default'];
      if (typeof entry === 'string' && entry) return entry;
    } catch {
      // Not JSON: use the legacy key
    }
  }
  return env('SUPABASE_SERVICE_ROLE_KEY') || undefined;
};

/**
 * Auth headers for a REST call. A new `sb_secret_` key is not a JWT and must never be sent as a
 * Bearer token; only a legacy JWT key (`eyJ…`) is also sent as one.
 */
export const keyHeaders = (key: string): Record<string, string> =>
  key.startsWith('eyJ')
    ? { apikey: key, Authorization: `Bearer ${key}` }
    : { apikey: key };

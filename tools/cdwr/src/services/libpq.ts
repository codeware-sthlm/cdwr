/**
 * A `postgres://` connection string as libpq's own environment variables, so
 * `psql` and `pg_dump` get it without the url in their arguments. libpq never
 * expands a url in `PGDATABASE`, so the parts go one by one. Throws on anything else.
 */
export const libpqEnv = (url: string): Record<string, string> => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('the database url does not parse');
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    throw new Error('the database url is not a postgres:// url');
  }
  const env: Record<string, string> = {};
  const set = (key: string, value: string | null) => {
    if (value) env[key] = value;
  };
  set('PGHOST', parsed.hostname.replace(/^\[(.*)\]$/, '$1'));
  set('PGPORT', parsed.port);
  set('PGUSER', decodeURIComponent(parsed.username));
  set('PGPASSWORD', decodeURIComponent(parsed.password));
  set('PGDATABASE', decodeURIComponent(parsed.pathname.replace(/^\//, '')));
  set('PGSSLMODE', parsed.searchParams.get('sslmode'));
  return env;
};

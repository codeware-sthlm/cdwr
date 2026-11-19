-- Read by `cdwr agent platform-record`: one JSON document, tenants and database figures.
-- A single SELECT, so the connection stays read-only in effect. Never select the
-- tenants' api key, or any hash, salt or token column. The role may only read the columns
-- granted in `tools/cdwr/agent-queue/platform-role.sql`: a new column goes there too.
SELECT json_build_object(
  'tenants', coalesce((
    SELECT json_agg(json_build_object(
      'slug', t.slug,
      'name', t.name,
      'deployment', t.deployment,
      'status', t.status,
      'statsWebsiteId', t.stats_website_id,
      'domains', coalesce((
        SELECT json_agg(json_build_object(
          'hostname', d.hostname,
          'app', d.app,
          'primary', coalesce(d.is_primary, false),
          'certificateStatus', d.certificate_status
        ) ORDER BY d._order)
        FROM payload.tenants_domains d
        WHERE d._parent_id = t.id
      ), '[]'::json)
    ) ORDER BY t.slug)
    FROM payload.tenants t
  ), '[]'::json),
  'db', json_build_object(
    'sizeBytes', pg_database_size(current_database()),
    'sessions', (
      SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
    ),
    -- Only these take a slot in the session pool; Supabase's own sessions and
    -- Supavisor's `(auth_query)` lookup do not
    'poolerSessions', (
      SELECT count(*) FROM pg_stat_activity
      WHERE datname = current_database() AND application_name = 'Supavisor'
    ),
    -- What runs out is max_connections, which is per server: every client backend
    -- takes a slot, whichever database or role it uses
    'connections', (
      SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend'
    ),
    'maxConnections', current_setting('max_connections')::int,
    -- reserved_connections exists from Postgres 16 on
    'reservedConnections',
      current_setting('superuser_reserved_connections')::int
      + coalesce(nullif(current_setting('reserved_connections', true), '')::int, 0),
    -- Cumulative since the statistics were reset; the delta between ticks shows a burst
    'sessionsOpened', (
      SELECT coalesce(sum(sessions), 0)::bigint FROM pg_stat_database
    ),
    'byApplication', coalesce((
      SELECT json_object_agg(application, sessions)
      FROM (
        SELECT coalesce(nullif(application_name, ''), '(none)') AS application,
               count(*) AS sessions
        FROM pg_stat_activity
        WHERE backend_type = 'client backend'
        GROUP BY 1
      ) per_application
    ), '{}'::json)
  )
);

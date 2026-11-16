-- What the platform tick's read-only role may read, as columns of the cms production database.
-- Run as the database owner. Without `grant=1` it only reports; with it, it grants and reports again:
--   psql "<owner url>" -v role=<platform role> -f tools/cdwr/agent-queue/platform-role.sql
--   psql "<owner url>" -v role=<platform role> -v grant=1 -f tools/cdwr/agent-queue/platform-role.sql
-- Column grants on exactly what `platform.sql` reads, so the role never sees api keys or hashes.
-- They survive added and altered columns; rerun after a granted column or table is dropped and
-- recreated, or when `platform.sql` reads a new column (add it to both lists here first).
-- Rerunning is harmless. Grant mode fails when the role can still read more than the list.

\set ON_ERROR_STOP on

\if :{?role}
\else
  \echo 'Pass the role: -v role=<platform role>'
  \quit
\endif

\if :{?grant}
  \if :grant
-- A role that inherits pg_read_all_data reads every column whatever is granted here
SELECT pg_has_role(:'role', 'pg_read_all_data', 'USAGE') AS read_all \gset
    \if :read_all
DO $$ BEGIN RAISE EXCEPTION 'the role inherits pg_read_all_data; revoke that membership first'; END $$;
    \endif
-- Revoking the table-wide SELECT also revokes every column grant, so only the list below stays
REVOKE SELECT ON payload.tenants, payload.tenants_domains FROM :"role";
GRANT USAGE ON SCHEMA payload TO :"role";
GRANT SELECT (id, slug, name, deployment, status, stats_website_id)
  ON payload.tenants TO :"role";
GRANT SELECT (_parent_id, _order, hostname, app, is_primary, certificate_status)
  ON payload.tenants_domains TO :"role";
  \endif
\endif

-- Wanted: schema_usage t, both table_wide f, member_of_read_all f
SELECT has_schema_privilege(:'role', 'payload', 'USAGE') AS schema_usage,
       has_table_privilege(:'role', 'payload.tenants', 'SELECT') AS tenants_table_wide,
       has_table_privilege(:'role', 'payload.tenants_domains', 'SELECT') AS domains_table_wide,
       pg_has_role(:'role', 'pg_read_all_data', 'USAGE') AS member_of_read_all;

-- Wanted: every can_select t
SELECT needed.tbl AS "table", needed.col AS "column",
       has_column_privilege(:'role', needed.tbl, needed.col, 'SELECT') AS can_select
FROM (VALUES
  ('payload.tenants', 'id'),
  ('payload.tenants', 'slug'),
  ('payload.tenants', 'name'),
  ('payload.tenants', 'deployment'),
  ('payload.tenants', 'status'),
  ('payload.tenants', 'stats_website_id'),
  ('payload.tenants_domains', '_parent_id'),
  ('payload.tenants_domains', '_order'),
  ('payload.tenants_domains', 'hostname'),
  ('payload.tenants_domains', 'app'),
  ('payload.tenants_domains', 'is_primary'),
  ('payload.tenants_domains', 'certificate_status')
) AS needed (tbl, col);

-- Wanted: nothing printed. Any column the role reads beyond the list, by any route: a grant, PUBLIC or a role it inherits
SELECT string_agg(format('%s.%s', c.table_name, c.column_name), ', '
                  ORDER BY c.table_name, c.column_name) AS extra
FROM information_schema.columns c
WHERE c.table_schema = 'payload'
  AND c.table_name IN ('tenants', 'tenants_domains')
  AND has_column_privilege(:'role', format('payload.%I', c.table_name), c.column_name, 'SELECT')
  AND (c.table_name, c.column_name) NOT IN (VALUES
    ('tenants', 'id'), ('tenants', 'slug'), ('tenants', 'name'), ('tenants', 'deployment'),
    ('tenants', 'status'), ('tenants', 'stats_website_id'),
    ('tenants_domains', '_parent_id'), ('tenants_domains', '_order'),
    ('tenants_domains', 'hostname'), ('tenants_domains', 'app'),
    ('tenants_domains', 'is_primary'), ('tenants_domains', 'certificate_status')) \gset
-- A NULL aggregate leaves `extra` unset
\if :{?extra}
  \echo 'Beyond the list the role can read:' :extra
  \if :{?grant}
    \if :grant
DO $$ BEGIN RAISE EXCEPTION 'the role still reads columns beyond the list; see above'; END $$;
    \endif
  \endif
\endif

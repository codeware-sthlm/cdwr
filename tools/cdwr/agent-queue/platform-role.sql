-- What the platform tick's read-only role may read, as columns of the cms production database.
-- Run as the database owner. Without `grant=1` it only reports; with it, it grants and reports again:
--   psql "<owner url>" -v role=<platform role> -f tools/cdwr/agent-queue/platform-role.sql
--   psql "<owner url>" -v role=<platform role> -v grant=1 -f tools/cdwr/agent-queue/platform-role.sql
-- Column grants on exactly what `platform.sql` reads, so the role never sees api keys or hashes.
-- They survive added and altered columns; rerun after a granted column or table is dropped and
-- recreated, or when `platform.sql` reads a new column (add it here first). Rerunning is harmless.

\set ON_ERROR_STOP on

\if :{?role}
\else
  \echo 'Pass the role: -v role=<platform role>'
  \quit
\endif

\if :{?grant}
  \if :grant
-- A table-wide SELECT would expose every column; revoking it also clears the column grants
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

-- Everything the role holds on these tables today, so a grant that was never made shows as absent
SELECT table_name, column_name, privilege_type
FROM information_schema.column_privileges
WHERE grantee = :'role'
  AND table_schema = 'payload'
  AND table_name IN ('tenants', 'tenants_domains')
ORDER BY table_name, column_name;

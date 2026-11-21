-- The signals the platform step reads of each tenant besides its Fly apps: Sentry errors, Umami visitors, and for the `_shared` row the last deploy.
-- Applied by hand to the Supabase project `agent-queue`, after 20261115130000_tenant_state.sql.
-- A row of a tenant without that signal keeps `{}`; a read that failed is named in `errors`.

alter table public.tenant_state add column if not exists sentry jsonb not null default '{}';
alter table public.tenant_state add column if not exists visitors jsonb not null default '{}';
alter table public.tenant_state add column if not exists deploy jsonb not null default '{}';

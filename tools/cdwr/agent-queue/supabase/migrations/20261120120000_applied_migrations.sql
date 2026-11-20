-- The ledger of migrations the NUC's apply list ran, one row per file, written by `cdwr agent supabase-migrate`.
-- Applied by hand to the Supabase project `agent-queue`, after 20261116120000_tenant_state_backup.sql.
-- No policy: only the owner and the service role read or write it.

create table if not exists public.applied_migrations (
  -- the file name without its folder, as the migration is named in this directory
  file text primary key,
  applied_at timestamptz not null default now()
);

comment on table public.applied_migrations is
  'Each migration the NUC''s apply list applied, by file name; supabase-migrate skips what is listed here.';

alter table public.applied_migrations enable row level security;

revoke all on public.applied_migrations from anon, authenticated;
grant all on public.applied_migrations to service_role;

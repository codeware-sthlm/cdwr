-- What the platform step reads of each tenant, one row per tenant slug and one `_shared` row for the shared settings.
-- Applied by hand to the Supabase project `agent-queue`, after 20261028120000_queue_state.sql.
-- The platform step overwrites a row each run; `at` is when it was read.

create table if not exists public.tenant_state (
  key text primary key,
  at timestamptz not null,
  name text,
  deployment text,
  status text,
  apps jsonb not null default '[]',
  domains jsonb not null default '[]',
  switches jsonb not null default '[]',
  db jsonb not null default '{}',
  errors jsonb not null default '{}'
);

alter table public.tenant_state enable row level security;

drop policy if exists tenant_state_select_anon on public.tenant_state;
create policy tenant_state_select_anon on public.tenant_state for select to anon using (true);

revoke all on public.tenant_state from anon, authenticated;
grant select on public.tenant_state to anon;
grant all on public.tenant_state to service_role;

-- Realtime for the desk; a table already published is skipped, so this can run again
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tenant_state'
  ) then
    alter publication supabase_realtime add table public.tenant_state;
  end if;
end
$$;

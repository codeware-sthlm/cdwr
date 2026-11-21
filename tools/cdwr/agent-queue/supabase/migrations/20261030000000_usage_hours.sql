-- Claude usage per whole UTC hour, host, model and role, across every Claude project on the host.
-- Applied by hand to the Supabase project `agent-queue`, after 20261029230000_host_metrics.sql.
-- The sender prunes its own host's rows after 14 days.

create table if not exists public.usage_hours (
  hour timestamptz not null,
  host text not null,
  model text not null,
  role text not null,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  cost_usd numeric(12, 4) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (hour, model, role, host)
);

create index if not exists usage_hours_hour_idx on public.usage_hours (hour desc);

alter table public.usage_hours enable row level security;

drop policy if exists usage_hours_select_anon on public.usage_hours;
create policy usage_hours_select_anon on public.usage_hours for select to anon using (true);

revoke all on public.usage_hours from anon, authenticated;
grant select on public.usage_hours to anon;
grant all on public.usage_hours to service_role;

-- Realtime for the desk; a table already published is skipped, so this can run again
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'usage_hours'
  ) then
    alter publication supabase_realtime add table public.usage_hours;
  end if;
end
$$;

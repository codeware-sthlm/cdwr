-- Load, memory and disk samples of the machine running the queue, one row per sample and host.
-- Applied by hand to the Supabase project `agent-queue`, after 20261028120000_queue_state.sql.
-- The sampler prunes its own host's rows after 7 days; memory and disk are in bytes.

create table if not exists public.host_metrics (
  id bigint generated always as identity primary key,
  host text not null,
  at timestamptz not null default now(),
  cores int not null,
  load1 real not null,
  load5 real not null,
  load15 real not null,
  mem_total bigint not null,
  mem_available bigint not null,
  swap_total bigint not null,
  swap_free bigint not null,
  disk_total bigint not null,
  disk_free bigint not null,
  -- null when the container has no memory limit (memory.max is `max`) or the file is absent
  cgroup_mem_current bigint,
  cgroup_mem_max bigint
);

create index if not exists host_metrics_host_at_idx on public.host_metrics (host, at desc);

alter table public.host_metrics enable row level security;

drop policy if exists host_metrics_select_anon on public.host_metrics;
create policy host_metrics_select_anon on public.host_metrics for select to anon using (true);

revoke all on public.host_metrics from anon, authenticated;
grant select on public.host_metrics to anon;
grant all on public.host_metrics to service_role;

-- Realtime for the desk; a table already published is skipped, so this can run again
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'host_metrics'
  ) then
    alter publication supabase_realtime add table public.host_metrics;
  end if;
end
$$;

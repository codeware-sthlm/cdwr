-- What the queue would take next, per host: the runs document's lines and queue view, as rows.
-- Applied by hand to the Supabase project `agent-queue`, after 20261027120000_agent_telemetry.sql.
-- Each line is stored as the text run.sh prints, so its format is defined in one place.

create table if not exists public.queue_state (
  host text primary key,
  at timestamptz not null,
  last_run text,
  attended text,
  suggested text,
  job text,
  view jsonb
);

alter table public.queue_state enable row level security;

drop policy if exists queue_state_select_anon on public.queue_state;
create policy queue_state_select_anon on public.queue_state for select to anon using (true);

revoke all on public.queue_state from anon, authenticated;
grant select on public.queue_state to anon;
grant all on public.queue_state to service_role;

-- Cache tokens, which the desk's model and ticket tables show
alter table public.usage
  add column if not exists cache_read_tokens bigint not null default 0,
  add column if not exists cache_write_tokens bigint not null default 0;

-- Realtime for every table the desk reads; a table already published is skipped, so this can run again
do $$
declare
  t text;
begin
  foreach t in array array['queue_state', 'runs', 'usage', 'activity', 'sessions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

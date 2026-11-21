-- Every notice the queue sends, one row each, inserted from a host's notify spool by whatever holds
-- the key there (run.sh, and the container's sampler). Only the NUC relay forwards rows to Slack: it
-- posts the pending rows its dial lets through and marks every row forwarded or held, so turning the
-- dial up later replays nothing.
-- Applied by the NUC's apply list, after 20261121120000_host_metrics_exposed.sql.
-- Anon may read it and the repo is public, so a row holds the text Slack gets: names and ids, never a value.

create table if not exists public.notices (
  -- `<host>:<spool file name>`, so a resent insert is ignored
  id text primary key,
  -- when the notice was written to the spool
  at timestamptz not null,
  host text not null,
  level text not null check (level in ('urgent', 'action', 'info')),
  source text,
  ticket text,
  text text not null,
  state text not null default 'pending' check (state in ('pending', 'forwarded', 'held')),
  forwarded_at timestamptz,
  -- when the row reached the table, which a resend never changes (clock_timestamp, as in own_actions)
  received_at timestamptz not null default clock_timestamp()
);

create index if not exists notices_state_at_idx on public.notices (state, at);
create index if not exists notices_received_at_idx on public.notices (received_at);

alter table public.notices enable row level security;

drop policy if exists notices_select_anon on public.notices;
create policy notices_select_anon on public.notices for select to anon using (true);

revoke all on public.notices from anon, authenticated;
grant select on public.notices to anon;
grant all on public.notices to service_role;

-- The host's notify dial, as { level, muteUntil }, written with the rest of queue_state. No policy
-- change: the service role already has all.
alter table public.queue_state add column if not exists notify jsonb;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notices'
  ) then
    alter publication supabase_realtime add table public.notices;
  end if;
end
$$;

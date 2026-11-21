-- The last Linear change per issue, written by the linear-webhook function, so the desk hears it through Realtime.
-- Applied by hand to the Supabase project `agent-queue`, after 20261028120000_queue_state.sql.
-- Anon may read it and the repo is public, so it holds ids and the action only, never the payload.

create table if not exists public.issue_events (
  -- Linear's issue UUID; a Comment event carries it as data.issueId
  issue_id text primary key,
  -- COD-123 when the event carries it; a Comment event may not
  identifier text,
  action text not null,
  updated_at timestamptz not null
);

alter table public.issue_events enable row level security;

drop policy if exists issue_events_select_anon on public.issue_events;
create policy issue_events_select_anon on public.issue_events for select to anon using (true);

revoke all on public.issue_events from anon, authenticated;
grant select on public.issue_events to anon;
grant all on public.issue_events to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'issue_events'
  ) then
    alter publication supabase_realtime add table public.issue_events;
  end if;
end
$$;

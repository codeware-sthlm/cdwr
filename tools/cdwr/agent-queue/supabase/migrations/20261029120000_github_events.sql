-- The last GitHub event per pull request or branch, written by the github-webhook function, so the NUC's
-- scheduler can wake on it through Realtime.
-- Applied by hand to the Supabase project `agent-queue`, after 20261028220000_issue_events.sql.
-- Anon may read it and the repo is public, so it holds the subject and the action only, never the payload.

create table if not exists public.github_events (
  -- pr/<number> when the event names a pull request, else ref/<branch>
  subject text primary key,
  pr integer,
  action text not null,
  updated_at timestamptz not null
);

alter table public.github_events enable row level security;

drop policy if exists github_events_select_anon on public.github_events;
create policy github_events_select_anon on public.github_events for select to anon using (true);

revoke all on public.github_events from anon, authenticated;
grant select on public.github_events to anon;
grant all on public.github_events to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'github_events'
  ) then
    alter publication supabase_realtime add table public.github_events;
  end if;
end
$$;

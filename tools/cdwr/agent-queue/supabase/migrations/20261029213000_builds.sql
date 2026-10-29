-- The newest successful build on main per workflow, written by the github-webhook function from
-- workflow_run events, so the desk can tell when the agent image or the desk itself is behind main.
-- Applied by hand to the Supabase project `agent-queue`, after 20261029120000_github_events.sql.
-- A table of its own, not rows in github_events: the NUC's scheduler wakes on github_events.
-- Anon may read it and the repo is public, so it holds the workflow and the commit only.

create table if not exists public.builds (
  -- the workflow file, e.g. agent-host-image.yml
  workflow text primary key,
  sha text not null,
  -- when the run was created; unlike its start time, a re-run of an old run keeps it
  run_created_at timestamptz not null,
  updated_at timestamptz not null
);

-- Runs can finish out of order, or be re-run, so an older run never overwrites a newer one
create or replace function public.builds_keep_newer() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.run_created_at < old.run_created_at then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists builds_keep_newer on public.builds;
create trigger builds_keep_newer before update on public.builds
  for each row execute function public.builds_keep_newer();

alter table public.builds enable row level security;

drop policy if exists builds_select_anon on public.builds;
create policy builds_select_anon on public.builds for select to anon using (true);

revoke all on public.builds from anon, authenticated;
grant select on public.builds to anon;
grant all on public.builds to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'builds'
  ) then
    alter publication supabase_realtime add table public.builds;
  end if;
end
$$;

-- What the queue did on its own, one row per event, written by the scheduler from its own.jsonl, and
-- the list of them each review read since the review before it.
-- Applied by the NUC's apply list, after 20261120120000_applied_migrations.sql.
-- Anon may read it and the repo is public, so a row holds ids, kinds and reasons, never a value: an
-- apply item's target is its spec, which names a file or a resource.

create table if not exists public.own_actions (
  -- deterministic per event, e.g. `apply:COD-1:<comment id>:0`, so a resend is ignored
  event_id text primary key,
  at timestamptz not null,
  host text not null,
  kind text not null check (kind in ('merge', 'deploy', 'apply', 'self-deploy')),
  ticket text,
  pr integer,
  title text,
  target text,
  result text not null,
  reason text,
  -- when the row reached the table, which a resend never changes: a review lists the rows received
  -- since the one before it, so an event sent late is still listed once
  received_at timestamptz not null default now()
);

create index if not exists own_actions_received_at_idx on public.own_actions (received_at);

alter table public.own_actions enable row level security;

drop policy if exists own_actions_select_anon on public.own_actions;
create policy own_actions_select_anon on public.own_actions for select to anon using (true);

revoke all on public.own_actions from anon, authenticated;
grant select on public.own_actions to anon;
grant all on public.own_actions to service_role;

-- The own_actions rows the review listed, as { since, until, items }, rendered above the brief; null
-- when they were not read, and on every review before this column
alter table public.reviews add column if not exists own jsonb;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'own_actions'
  ) then
    alter publication supabase_realtime add table public.own_actions;
  end if;
end
$$;

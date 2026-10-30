-- The plan's own usage, as Claude Code's status line reports it: one row per window, reset and value.
-- Applied by hand to the Supabase project `agent-queue`, after 20261030000000_usage_hours.sql.
-- statusline.sh sends a row when a value changed and again every 10 minutes while it holds; the
-- same value is one row, whose sampled_at is the newest time it was seen.
-- The sender prunes rows sampled more than 14 days ago.

create table if not exists public.plan_usage (
  kind text not null check (kind in ('five_hour', 'seven_day')),
  resets_at timestamptz not null,
  used_percentage numeric(5, 2) not null,
  sampled_at timestamptz not null default now(),
  host text not null,
  primary key (kind, resets_at, used_percentage)
);

create index if not exists plan_usage_sampled_at_idx on public.plan_usage (sampled_at desc);

alter table public.plan_usage enable row level security;

drop policy if exists plan_usage_select_anon on public.plan_usage;
create policy plan_usage_select_anon on public.plan_usage for select to anon using (true);

revoke all on public.plan_usage from anon, authenticated;
grant select on public.plan_usage to anon;
grant all on public.plan_usage to service_role;

-- Realtime for the desk; a table already published is skipped, so this can run again
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'plan_usage'
  ) then
    alter publication supabase_realtime add table public.plan_usage;
  end if;
end
$$;

-- Agent queue telemetry: runs, usage, activity and heartbeats.
-- Applied by hand to the Supabase project `agent-queue` (its own project, not the Payload database).
-- Writers use the service key (service_role bypasses RLS); the desk reads with the anon key,
-- which may only SELECT. Open-PR count is not stored here, so `status` leaves it out.

create table if not exists public.runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null,
  finished_at timestamptz,
  outcome text not null,
  ticket text,
  detail text,
  host text not null,
  attended boolean,
  job jsonb not null default '{}'
);
create index if not exists runs_started_at_idx on public.runs (started_at desc);

create table if not exists public.usage (
  id bigint generated always as identity primary key,
  day date not null,
  ticket text,
  model text not null,
  role text not null check (role in ('planning', 'orchestrating', 'implementing')),
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(12, 4) not null default 0,
  host text not null,
  constraint usage_key unique nulls not distinct (day, ticket, model, role, host)
);
create index if not exists usage_day_ticket_idx on public.usage (day, ticket);

create table if not exists public.activity (
  id bigint generated always as identity primary key,
  -- Linear's own id (history:<id>, comment:<id>) or a derived key for the scheduler's runs;
  -- an edited comment keeps it, so its row is updated rather than duplicated
  event_id text not null unique,
  at timestamptz not null,
  ticket text,
  actor text not null check (actor in ('agent', 'scheduler', 'human')),
  change text not null,
  host text
);
create index if not exists activity_at_idx on public.activity (at desc);

-- One row per Claude session; last_seen is its heartbeat
create table if not exists public.sessions (
  id text primary key,
  host text not null,
  kind text not null,
  last_seen timestamptz not null
);

-- The last run and the last heartbeat per host, as one row
create or replace view public.status with (security_invoker = true) as
select
  (
    select to_jsonb(r)
    from (
      select started_at, outcome, ticket, host
      from public.runs
      order by started_at desc
      limit 1
    ) r
  ) as last_run,
  coalesce(
    (
      select jsonb_agg(jsonb_build_object('host', h.host, 'last_seen', h.last_seen) order by h.host)
      from (
        select host, max(last_seen) as last_seen
        from public.sessions
        group by host
      ) h
    ),
    '[]'::jsonb
  ) as hosts;

alter table public.runs enable row level security;
alter table public.usage enable row level security;
alter table public.activity enable row level security;
alter table public.sessions enable row level security;

drop policy if exists runs_select_anon on public.runs;
create policy runs_select_anon on public.runs for select to anon using (true);
drop policy if exists usage_select_anon on public.usage;
create policy usage_select_anon on public.usage for select to anon using (true);
drop policy if exists activity_select_anon on public.activity;
create policy activity_select_anon on public.activity for select to anon using (true);
drop policy if exists sessions_select_anon on public.sessions;
create policy sessions_select_anon on public.sessions for select to anon using (true);

-- A fresh Supabase project grants anon and authenticated everything on public; take it back
revoke all on public.runs, public.usage, public.activity, public.sessions, public.status
  from anon, authenticated;
grant select on public.runs, public.usage, public.activity, public.sessions, public.status to anon;
grant all on public.runs, public.usage, public.activity, public.sessions, public.status to service_role;
grant usage, select on all sequences in schema public to service_role;

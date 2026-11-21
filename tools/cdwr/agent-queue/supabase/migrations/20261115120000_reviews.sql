-- One row per review the scheduler's review session wrote, and one row per finding dismissed from
-- the desk, written by the desk-command function.
-- Applied by hand to the Supabase project `agent-queue`, after 20261113120000_queue_state_devlog.sql.
-- A review holds its brief, the actions it proposes and the findings it raised; a dismissal names a
-- finding by its id and holds while the finding keeps that id, so nothing cleans them up.
-- Anon may read both. The service role writes reviews; dismissals are written through desk_dismiss.

create table if not exists public.reviews (
  id bigserial primary key,
  host text not null,
  at timestamptz not null default now(),
  -- the review's brief, as markdown
  brief text not null,
  actions jsonb not null default '[]',
  findings jsonb not null default '[]',
  -- tickets whose description no longer matches their state
  stale jsonb not null default '[]',
  suggestions jsonb not null default '[]',
  -- the session's cost in dollars and the model that ran it
  cost numeric,
  model text
);

create index if not exists reviews_at_idx on public.reviews (at desc);

create table if not exists public.review_dismissals (
  -- the finding's id, as `<kind>:COD-<n>:<8 hex>`
  finding_id text primary key,
  at timestamptz not null default now(),
  -- the device whose token dismissed it
  actor text,
  note text check (char_length(note) <= 200)
);

alter table public.reviews enable row level security;
alter table public.review_dismissals enable row level security;

drop policy if exists reviews_select_anon on public.reviews;
create policy reviews_select_anon on public.reviews for select to anon using (true);
drop policy if exists review_dismissals_select_anon on public.review_dismissals;
create policy review_dismissals_select_anon on public.review_dismissals for select to anon using (true);

revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon;
grant all on public.reviews to service_role;
revoke all on public.review_dismissals from anon, authenticated;
grant select on public.review_dismissals to anon;
grant all on public.review_dismissals to service_role;
grant usage, select on sequence public.reviews_id_seq to service_role;

alter table public.desk_commands drop constraint if exists desk_commands_kind_check;
alter table public.desk_commands add constraint desk_commands_kind_check
  check (
    kind in (
      'pause', 'resume', 'run', 'limit', 'cap', 'abandon', 'snooze', 'wake', 'copilot', 'merge',
      'review', 'dismiss'
    )
  );

-- Dismisses the finding (replacing an older dismissal) and records the command in one transaction.
-- Service role only.
create or replace function public.desk_dismiss(
  p_host text,
  p_actor text,
  p_at timestamptz,
  p_finding text,
  p_note text
)
returns table (id bigint, status text, note text)
language plpgsql
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.review_dismissals as d (finding_id, at, actor, note)
  values (p_finding, p_at, p_actor, p_note)
  on conflict (finding_id) do update
  set at = excluded.at, actor = excluded.actor, note = excluded.note;

  insert into public.desk_commands as c (at, host, kind, args, actor, status, applied_at, note)
  values (
    p_at, p_host, 'dismiss',
    jsonb_build_object('finding', p_finding, 'note', p_note),
    p_actor, 'applied', p_at, null
  )
  returning c.id into v_id;

  return query select v_id, 'applied'::text, null::text;
end
$$;

revoke all on function public.desk_dismiss(text, text, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.desk_dismiss(text, text, timestamptz, text, text)
  to service_role;

-- The scheduler's one-line review status, read by `cdwr agent status`. No policy change: the
-- service role already has all.
alter table public.queue_state add column if not exists review text;

do $$
declare
  t text;
begin
  foreach t in array array['reviews', 'review_dismissals'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

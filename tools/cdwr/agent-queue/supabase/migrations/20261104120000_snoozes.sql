-- One row per Waiting on you row snoozed from the desk, written by the desk-command function.
-- Applied by hand to the Supabase project `agent-queue`, after 20261102120000_desk_commands.sql.
-- A snooze holds while the row's kind and newest gate event match what the desk saw when it was set;
-- the desk ignores a row that no longer matches, so nothing cleans them up. Anon may read it.

create table if not exists public.snoozes (
  ticket text primary key check (ticket ~ '^COD-[0-9]+$'),
  -- the row's kind when snoozed, as the desk's WaitRow names it
  kind text not null check (
    kind in ('review', 'hand-offs', 'question', 'plan', 'ready to label', 'idea', 'approved')
  ),
  -- the row's newest gate event when snoozed; null when it had none
  event_at timestamptz,
  at timestamptz not null default now(),
  -- the device whose token snoozed it
  actor text not null
);

alter table public.snoozes enable row level security;

drop policy if exists snoozes_select_anon on public.snoozes;
create policy snoozes_select_anon on public.snoozes for select to anon using (true);

revoke all on public.snoozes from anon, authenticated;
grant select on public.snoozes to anon;
grant all on public.snoozes to service_role;

alter table public.desk_commands drop constraint if exists desk_commands_kind_check;
alter table public.desk_commands add constraint desk_commands_kind_check
  check (kind in ('pause', 'resume', 'run', 'limit', 'cap', 'abandon', 'snooze', 'wake'));

-- Snoozes the ticket (replacing an older snooze) and records the command in one transaction.
-- Service role only.
create or replace function public.desk_snooze(
  p_host text,
  p_actor text,
  p_at timestamptz,
  p_ticket text,
  p_kind text,
  p_event_at timestamptz
)
returns table (id bigint, status text, note text)
language plpgsql
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.snoozes as s (ticket, kind, event_at, at, actor)
  values (p_ticket, p_kind, p_event_at, p_at, p_actor)
  on conflict (ticket) do update
  set kind = excluded.kind, event_at = excluded.event_at, at = excluded.at, actor = excluded.actor;

  insert into public.desk_commands as c (at, host, kind, args, actor, status, applied_at, note)
  values (
    p_at, p_host, 'snooze',
    jsonb_build_object('ticket', p_ticket, 'kind', p_kind, 'eventAt', p_event_at),
    p_actor, 'applied', p_at, null
  )
  returning c.id into v_id;

  return query select v_id, 'applied'::text, null::text;
end
$$;

revoke all on function public.desk_snooze(text, text, timestamptz, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.desk_snooze(text, text, timestamptz, text, text, timestamptz)
  to service_role;

-- Removes the ticket's snooze and records the command in one transaction. A ticket with no
-- snooze stores the command refused. Service role only.
create or replace function public.desk_wake(
  p_host text,
  p_actor text,
  p_at timestamptz,
  p_ticket text
)
returns table (id bigint, status text, note text)
language plpgsql
set search_path = ''
as $$
declare
  v_id bigint;
  v_status text := 'refused';
  v_note text := 'not snoozed';
begin
  delete from public.snoozes s where s.ticket = p_ticket;
  if found then
    v_status := 'applied';
    v_note := null;
  end if;

  insert into public.desk_commands as c (at, host, kind, args, actor, status, applied_at, note)
  values (
    p_at, p_host, 'wake', jsonb_build_object('ticket', p_ticket), p_actor, v_status,
    case when v_status = 'applied' then p_at end, v_note
  )
  returning c.id into v_id;

  return query select v_id, v_status, v_note;
end
$$;

revoke all on function public.desk_wake(text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.desk_wake(text, text, timestamptz, text) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'snoozes'
  ) then
    alter publication supabase_realtime add table public.snoozes;
  end if;
end
$$;

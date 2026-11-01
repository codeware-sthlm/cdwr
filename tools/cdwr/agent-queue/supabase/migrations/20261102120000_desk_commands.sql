-- One row per action taken from the desk, written by the desk-command function with the service key.
-- Applied by hand to the Supabase project `agent-queue`, after 20261101120000_session_state.sql.
-- The scheduler on `host` applies pending rows to the files it reads and acks them; `abandon` is
-- applied by the function itself. Anon may read it: the actor is a device name, never a token.

create table if not exists public.desk_commands (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  host text not null,
  kind text not null check (kind in ('pause', 'resume', 'run', 'limit', 'cap', 'abandon')),
  args jsonb not null default '{}',
  -- the device whose token sent it
  actor text not null,
  status text not null default 'pending' check (status in ('pending', 'applied', 'refused')),
  applied_at timestamptz,
  note text
);
create index if not exists desk_commands_pending_idx
  on public.desk_commands (host, id) where status = 'pending';

alter table public.desk_commands enable row level security;

drop policy if exists desk_commands_select_anon on public.desk_commands;
create policy desk_commands_select_anon on public.desk_commands for select to anon using (true);

revoke all on public.desk_commands from anon, authenticated;
grant select on public.desk_commands to anon;
grant all on public.desk_commands to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'desk_commands'
  ) then
    alter publication supabase_realtime add table public.desk_commands;
  end if;
end
$$;

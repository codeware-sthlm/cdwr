-- Lets the desk-command function store the command `notify`, which sets the NUC's notify dial.
-- Applied by hand to the Supabase project `agent-queue`, after 20261122120000_notices.sql.

alter table public.desk_commands drop constraint if exists desk_commands_kind_check;
alter table public.desk_commands add constraint desk_commands_kind_check
  check (
    kind in (
      'pause', 'resume', 'run', 'limit', 'cap', 'abandon', 'snooze', 'wake', 'copilot', 'merge',
      'review', 'dismiss', 'restart', 'gate', 'notify'
    )
  );

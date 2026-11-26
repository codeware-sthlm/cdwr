-- Lets the desk-command function store the command `drop`, which strikes an open hand-off or Apply list item through in a merged ticket's PR-ready comment.
-- Applied by hand to the Supabase project `agent-queue`, after 20261122130000_desk_commands_notify.sql.

alter table public.desk_commands drop constraint if exists desk_commands_kind_check;
alter table public.desk_commands add constraint desk_commands_kind_check
  check (
    kind in (
      'pause', 'resume', 'run', 'limit', 'cap', 'abandon', 'snooze', 'wake', 'copilot', 'merge',
      'review', 'dismiss', 'restart', 'gate', 'notify', 'drop'
    )
  );

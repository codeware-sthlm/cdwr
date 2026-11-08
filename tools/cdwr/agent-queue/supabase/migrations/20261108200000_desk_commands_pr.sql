-- Adds the desk's Copilot review and merge commands, each carrying {ticket, pr}.
-- Applied by hand to the Supabase project `agent-queue`, after 20261104120000_snoozes.sql.
-- Like run, they are stored pending by the desk-command function; the scheduler applies them
-- as the codeware-agent GitHub app.

alter table public.desk_commands drop constraint if exists desk_commands_kind_check;
alter table public.desk_commands add constraint desk_commands_kind_check
  check (
    kind in ('pause', 'resume', 'run', 'limit', 'cap', 'abandon', 'snooze', 'wake', 'copilot', 'merge')
  );

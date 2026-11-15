-- Lets the desk-command function store the platform commands `restart` and `gate`.
-- Applied by hand to the Supabase project `agent-queue`, after 20261115130000_tenant_state.sql.

alter table public.desk_commands drop constraint if exists desk_commands_kind_check;
alter table public.desk_commands add constraint desk_commands_kind_check
  check (
    kind in (
      'pause', 'resume', 'run', 'limit', 'cap', 'abandon', 'snooze', 'wake', 'copilot', 'merge',
      'review', 'dismiss', 'restart', 'gate'
    )
  );

-- Adds the weekly devlog session's last outcome to queue_state: its devlog-line, a date and a verdict,
-- so the desk and `cdwr agent status` read it beside the suggestion.
-- Applied by hand to the Supabase project `agent-queue`, after 20261108200000_desk_commands_pr.sql.
-- No policy change: the service role already has all.

alter table public.queue_state add column if not exists devlog text;

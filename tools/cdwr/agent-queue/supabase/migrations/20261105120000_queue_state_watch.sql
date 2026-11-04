-- Adds the NUC's watch state to queue_state: its watch.json, the PRs of agent-labelled tickets with
-- their state and unresolved threads, so a Mac without the scheduler reads it.
-- Applied by hand to the Supabase project `agent-queue`, after 20261104120000_snoozes.sql.
-- No policy change: the service role already has all.

alter table public.queue_state add column if not exists watch jsonb;

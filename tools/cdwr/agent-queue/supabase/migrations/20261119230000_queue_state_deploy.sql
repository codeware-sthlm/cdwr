-- Adds the NUC's self-deploy state to queue_state: its deploy.json (the tag it runs, the one before,
-- when, by whom, and whether the first run on it is still being checked or was rolled back), so a
-- Mac without the scheduler reads it.
-- Applied by hand to the Supabase project `agent-queue`, after 20261105120000_queue_state_watch.sql.
-- No policy change: the service role already has all.

alter table public.queue_state add column if not exists deploy jsonb;

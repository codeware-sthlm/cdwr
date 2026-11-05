-- Adds the NUC's Renovate state to queue_state: its renovate.json, Renovate's open PRs with their
-- state and the ticket that tends each, so a Mac without the scheduler reads it.
-- Applied by hand to the Supabase project `agent-queue`, after 20261105120000_queue_state_watch.sql.
-- No policy change: the service role already has all.

alter table public.queue_state add column if not exists renovate jsonb;

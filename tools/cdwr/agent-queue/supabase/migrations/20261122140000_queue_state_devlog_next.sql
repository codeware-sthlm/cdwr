-- Adds the devlog gate's answer to queue_state as jsonb ({state, next, hour, text}), stored on every tick,
-- so the desk shows the devlog's next expected run beside its last one.
-- Applied by hand to the Supabase project `agent-queue`, after 20261122130000_desk_commands_notify.sql.
-- No policy change: the service role already has all.

alter table public.queue_state add column if not exists devlog_next jsonb;

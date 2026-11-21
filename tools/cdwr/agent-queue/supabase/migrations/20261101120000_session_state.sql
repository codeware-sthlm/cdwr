-- A session's state and detail, as the session file holds them, next to its last_seen.
-- Applied by hand to the Supabase project `agent-queue`, after 20261030120000_plan_usage.sql.
-- The hook sends them with each heartbeat, at once when a session ends or resumes: `ended` drops a
-- session from the desk immediately; null (older rows, older senders) keeps the last_seen rule.

alter table public.sessions add column if not exists state text;
alter table public.sessions add column if not exists detail text;

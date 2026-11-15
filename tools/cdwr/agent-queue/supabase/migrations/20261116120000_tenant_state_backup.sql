-- What `cdwr agent backup` left behind: the newest dump, how many there are, its size and how the last run went. Read by the platform step from the queue's home.
-- Applied by hand to the Supabase project `agent-queue`, after 20261115200000_tenant_state_signals.sql.
-- Only the `_shared` row has it; the rows of tenants keep `{}`.

alter table public.tenant_state add column if not exists backup jsonb not null default '{}';

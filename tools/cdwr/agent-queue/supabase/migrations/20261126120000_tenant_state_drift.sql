-- What `cdwr agent sweep` found: its findings (rule, subject, message, fix) and the rules it could not check. Read by the platform step from `sweep.json` in the queue's home.
-- Applied by hand to the Supabase project `agent-queue`, after 20261116120000_tenant_state_backup.sql.
-- Only the `_shared` row has it; the rows of tenants keep `{}`.

alter table public.tenant_state add column if not exists drift jsonb not null default '{}';

-- What the queue's container found of its own exposure at the sample: the names of the credential
-- environment variables in the queue loop's environment, and `claude as agent (pid N)` for a claude
-- process of the queue user. Names only, never a value; the repo is public and anon may read it.
-- An empty array is clean; null is a host that does not measure it (the Mac).
-- Applied by the NUC's apply list, after 20261120220000_own_actions.sql. It can run again.

alter table public.host_metrics add column if not exists exposed text[];

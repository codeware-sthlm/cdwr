# Agent host

The container the agent queue runs in on the NUC: `Dockerfile`, `compose.yaml`, `secrets.sh` (the
entrypoint, which reads Infisical and writes the key secrets and the rest of the vault to the tmpfs),
`entrypoint.sh` (the run loop) and `linear-mcp-proxy.mjs` (the Linear MCP the claude runs use).
How the queue itself works is in [tools/cdwr/agent-queue/README.md](../../tools/cdwr/agent-queue/README.md).

## Two users

The queue's own work runs as `agent` (uid 1000). It holds the key secrets on `/run/agent` (mode
0700, written by `secrets.sh`), the checkout `/work/codeware-agent` with its `tools/cdwr/.env`
(mode 600, the Supabase service key), the queue home `/home/agent/.cdwr/agent-queue` and its own
claude home. The scheduler, the listener, the proxy and the platform step are its. No claude runs
as `agent`.

The loop's environment holds only what `loop_env` in `secrets.sh` allows: the OAuth token, the App
identity, the publishable Supabase keys, the Slack webhook, the Sentry DSN and the queue's settings.
Every other vault key is in `/run/agent/vault.env` (mode 600), read as text by the scripts that need
it. A command given to `secrets.sh` (`cdwr agent exec`) still gets the whole vault exported. PID 1
(tini) keeps the Infisical identity from the compose `.env` in its environment, which only `agent`
can read.

Every claude run the scheduler starts, planning, suggestion, review, devlog and implement, runs as
`session` (uid 1001), through `claude_launch` in `lib.sh`. That is the boundary: a session runs
code, so a deny list alone cannot keep the secrets from it. A session owns `/home/session` with its own claude home (the volume
`session-claude-home`) and pnpm store (`session-pnpm-store`), the clone `/work/codeware-session`
and the ticket worktrees beside it. It reads the queue's checkout and the queue home, and writes
the sessions dir, the notice spool, `devlog-drafts/` and `review-out/` there, through the group `queue` both users are in (the
entrypoint sets those modes at every start, since Docker applies the image's to a new volume
only). It cannot read `/run/agent`, the checkout's `.env`, nor `/proc/1/environ` or the
entrypoint's.

What a session lacks, the queue's user does for it: the proxy answers the attended query
(`POST /attended`) so `wait.sh` can pick without Linear credentials, and the entrypoint's sampler
relays the session rows from the sessions dir and moves the notices `notify.sh` spooled into the
`notices` table, both within a minute. The same sampler is the one forwarder: it posts the pending
`notices` rows, the Mac's too, that this host's dial lets through and marks the rest held
(`tools/cdwr/agent-queue/README.md`, **Notices**).

Every claude run reads and writes the session's project memory. The entrypoint stages `agent`'s in
the queue home (`memory-from-agent/`, which the session reads and cannot write), and the launcher
merges it as the session, file by file with the newer copy winning, adding the index lines it lacks.
So what the planners learned as `agent` moves with them, and `agent` never writes where the session
can. Claude writes its transcripts mode 600; the launcher opens them to the group before and after
each run, so `usage-record` counts them. `/work/node_modules` is `agent`'s and empty, so no session
can plant a module the queue's node would find there.

The sampler checks the boundary every minute and sends it in its `host_metrics` row as `exposed`,
names only: credential names in the loop's environment, and claude processes of `agent`. The
desk's `<host> credentials` check fails while either is there, or when the row carries none, and
the sampler sends one Slack notice each time the set turns non-empty.

## The crossings

`/etc/sudoers.d/agent-host` (`sudoers` here, checked by `visudo` at build) allows exactly four
commands, all without a password:

- `agent` → `session`: `/opt/agent-host/session-launch.sh`, which `run.sh` and `implement.sh` run
  to start every claude. sudo resets the environment and keeps only the OAuth token, the GitHub token and
  identity, the queue's non-secret settings and the listener's publishable Supabase keys; the
  launcher marks the checkout safe for git, sets the session's home, the queue
  home it reads, its pnpm store, its clone, trusts the checkout for claude and `exec`s claude with
  the arguments it was given. The script is root's in the image, so neither user can change what
  the other crosses into.
- `agent` → `session`: `/opt/agent-host/session-stop.sh <pid>`, which `implement.sh` runs to stop
  a session on a container stop or deploy: the launcher's sudo runs as root and the session's
  processes are another user's, so the queue's user can signal neither. As `session` the script
  reaches that user's processes and no other.
- `session` → `agent`: `/opt/agent-host/git-credential-app.sh`, the git credential helper, so a
  session's git gets a fresh installation token at every call and never the App key. Its paths are
  fixed, since sudo resets the environment.
- `session` → `agent`: `/opt/agent-host/devlog-cms.sh`, the devlog run's `cdwr devlog covered` and
  `draft`, since the cms key stays with `agent`. The post comes on stdin, never as a path, and the
  arguments are checked, so the crossing reads no file the session names.

`gh` still reads `GH_TOKEN` from the environment the launch handed over, so it stops working
after an hour, as before; a `gh` credential helper is a possible follow-up.

Liveness is read with `ps`, never `kill -0`: the queue's user sees the session's processes but
cannot signal them. The ticket worktrees are the session's, so `cdwr agent worktree prune` runs
inside an implement session (its allow list has it, and its environment names the clone); the
entrypoint removes, once, the worktrees that were linked to the queue's checkout before the
session user existed.

# Agent host

The container the agent queue runs in on the NUC: `Dockerfile`, `compose.yaml`, `secrets.sh` (the
entrypoint, which fills the environment from Infisical and writes the key secrets to the tmpfs),
`entrypoint.sh` (the run loop) and `linear-mcp-proxy.mjs` (the Linear MCP the claude runs use).
How the queue itself works is in [tools/cdwr/agent-queue/README.md](../../tools/cdwr/agent-queue/README.md).

## Two users

The queue's own work runs as `agent` (uid 1000). It holds the key secrets on `/run/agent` (mode
0700, written by `secrets.sh`), the checkout `/work/codeware-agent` with its `tools/cdwr/.env`
(mode 600, the Supabase service key), the queue home `/home/agent/.cdwr/agent-queue` and its own
claude home. The scheduler, the listener, the proxy and the platform step are its.

The implement sessions the scheduler launches run as `session` (uid 1001). That is the boundary:
a session edits files and runs tests, which is code execution, so a deny list alone cannot keep
the secrets from it. A session owns `/home/session` with its own claude home (the volume
`session-claude-home`) and pnpm store (`session-pnpm-store`), the clone `/work/codeware-session`
and the ticket worktrees beside it. It reads the queue's checkout and the queue home, and writes
the sessions dir and the notice spool there, through the group `queue` both users are in (the
entrypoint sets those modes at every start, since Docker applies the image's to a new volume
only). It cannot read `/run/agent`, the checkout's `.env`, nor `/proc/1/environ` or the
entrypoint's.

What a session lacks, the queue's user does for it: the proxy answers the attended query
(`POST /attended`) so `wait.sh` can pick without Linear credentials, and the entrypoint's sampler
relays the session rows from the sessions dir and posts the notices `notify.sh` spooled, both
within a minute.

## The crossings

`/etc/sudoers.d/agent-host` (`sudoers` here, checked by `visudo` at build) allows exactly three
commands, all without a password:

- `agent` → `session`: `/opt/agent-host/session-launch.sh`, which `implement.sh` runs to start a
  session. sudo resets the environment and keeps only the OAuth token, the GitHub token and
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

`gh` still reads `GH_TOKEN` from the environment the launch handed over, so it stops working
after an hour, as before; a `gh` credential helper is a possible follow-up.

Liveness is read with `ps`, never `kill -0`: the queue's user sees the session's processes but
cannot signal them. The ticket worktrees are the session's, so `cdwr agent worktree prune` runs
inside an implement session (its allow list has it, and its environment names the clone); the
entrypoint removes, once, the worktrees that were linked to the queue's checkout before the
session user existed.

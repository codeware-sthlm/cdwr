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

## The root installer

Everything the NUC runs outside the container lives in `nuc/`: the self-deploy, the backup, their
systemd units and the installer itself. `cdwr`, the deploy user, has no sudo but one line in
`/etc/sudoers.d/cdwr-agent`:

```txt
cdwr ALL=(root) NOPASSWD: /usr/local/sbin/nuc-apply
```

`nuc-apply` is `nuc/nuc-apply.sh`, owned by root. `nuc-sync.sh`, from `cdwr-agent-nuc.timer`
every 5 minutes, calls it with the newest commit on main that touches `nuc/`
(`tools/cdwr/agent-queue/README.md`, "Host installer"). Given one 40-hex sha, and nothing else,
it:

- checks that main contains the sha, through GitHub's compare API
- lists `apps/agent-host/nuc` at the sha through the contents API, and fails before installing
  anything when a name is not `^[a-z0-9-]+\.(sh|service|timer)$` or an entry is not a file
- fetches each file at the sha from raw.githubusercontent
- installs each file that differs, owned by root: `*.sh` to `/usr/local/sbin` (755),
  `*.service` and `*.timer` to `/etc/systemd/system` (644), and `nuc-apply.sh` last, as
  `/usr/local/sbin/nuc-apply` by temp file and rename
- after a unit changed, runs `daemon-reload`, then `enable` and `restart` for each changed timer.
  A changed service is only reloaded: they are oneshots their timers fire, and restarting
  `cdwr-agent-deploy.service` would start a deploy.

It will not:

- run git, or read anything from a checkout: a checkout `cdwr` can write would run its own
  `.git/config` as root
- install from a branch, or from anywhere but `apps/agent-host/nuc` at a commit on main
- remove a file main deleted. Removing a unit or script stays a step by hand
- write under `/etc/sudoers.d`
- honour `NUC_APPLY_*` overrides when run as root (they exist for the specs; sudo drops them anyway)

The control is the hold list: `tools/cdwr/agent-queue/hold-paths.txt` holds `apps/agent-host/nuc/**`,
so a PR that changes what the installer installs, or the installer, never merges on its own.
Root on the NUC follows a merge Håkan made.

To change a script or unit, edit it in `nuc/` and merge. To add one, give it a name that fits the
pattern; a timer is enabled on its first install. The apply list's `nuc-install` waits for the
host to have applied the merge. A change under `nuc/` also triggers `agent-host-image.yml`, so an
image is built and self-deployed too; that is harmless. A failed run is retried by the next merge that touches `nuc/`, or by removing
`/opt/cdwr-agent/nuc-apply.json` on the NUC, so the next tick runs it again and records it.

### Installing it once

On the NUC, as an admin user (`ssh -t hakans@cdwr-nuc`), with `sha` the merge commit on main
that has `nuc/nuc-apply.sh`. Install the sudoers line only once the hold list holds the queue's
own scripts too (`watch.jq`, `run.sh`, `lib.sh`), or once you accept that an agent PR that rewrites
the merge verdict could reach root through it.

```sh
sha=<merge sha>
d="$(mktemp -d)"
curl -fsSL -o "$d/nuc-apply.sh" "https://raw.githubusercontent.com/codeware-sthlm/cdwr/$sha/apps/agent-host/nuc/nuc-apply.sh"
less "$d/nuc-apply.sh"
sudo install -m 755 -o root -g root "$d/nuc-apply.sh" /usr/local/sbin/nuc-apply
printf 'cdwr ALL=(root) NOPASSWD: /usr/local/sbin/nuc-apply\n' > "$d/cdwr-agent"
sudo visudo -cf "$d/cdwr-agent"
sudo install -m 440 -o root -g root "$d/cdwr-agent" /etc/sudoers.d/cdwr-agent
sudo /usr/local/sbin/nuc-apply "$sha"
sudo -u cdwr sudo -n -l /usr/local/sbin/nuc-apply
rm -r "$d"
```

The first run installs everything in `nuc/` that differs and enables its timers, the
installer's own `cdwr-agent-nuc.timer` included. The last line prints the installer's path when
`cdwr` may run it.

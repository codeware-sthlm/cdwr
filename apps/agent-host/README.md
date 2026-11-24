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
- notes each installed unit in `/var/lib/nuc-apply/pending` until systemd has taken it, so a run
  that failed between the install and the restart finishes that unit on the next run.

It will not:

- run git, or read anything from a checkout: a checkout `cdwr` can write would run its own
  `.git/config` as root
- install from a branch, or from anywhere but `apps/agent-host/nuc` at a commit on main
- remove a file main deleted. Removing a unit or script stays a step by hand
- write under `/etc/sudoers.d`
- honour `NUC_APPLY_*` overrides when run as root (they exist for the specs; sudo drops them anyway)

The control is the hold list: `tools/cdwr/agent-queue/hold-paths.txt` holds `apps/agent-host/**`,
`tools/cdwr/agent-queue/**` and `.claude/**`. So a PR that changes what the installer installs,
the installer, or the queue scripts that decide a merge never merges on its own. Root on the NUC
follows a merge Håkan made.

To change a script or unit, edit it in `nuc/` and merge. To add one, give it a name that fits the
pattern; a timer is enabled on its first install. The apply list's `nuc-install` waits for the
host to have applied the merge. A change under `nuc/` also triggers `agent-host-image.yml`, so an
image is built and self-deployed too; that is harmless. A failed run is retried by the next merge that touches `nuc/`, or by removing
`/opt/cdwr-agent/nuc-apply.json` on the NUC, so the next tick runs it again and records it.

### GitHub reads and the read-only token

The host reads GitHub's REST API: `self-deploy.sh` the image builds on main, `nuc-sync.sh` main's
head and the newest commit under `nuc/`, `nuc-apply` the compare and contents calls. Anonymous,
those draw on GitHub's 60 calls an hour per public IP, and the NUC shares its IP with the Mac, so
anything anonymous on the Mac eats into it. On 2026-11-22 that stalled the self-deploy for four
hours.

So each script signs its REST reads with the read-only token in
`/etc/cdwr-agent/github-read.token` (`root:cdwr`, 640; the folder `root:cdwr`, 750) when the file
is there, and is then counted against the token's 5,000 an hour. Without the file it reads
anonymously, as before. The token goes to curl through a file descriptor, never on its command
line. A token GitHub refuses (401: expired or revoked) is dropped: the read goes again
anonymously, `/opt/cdwr-agent/github-read.refused` notes the token file's mtime, one notice says
so, and neither `self-deploy.sh` nor `nuc-sync.sh` signs with it again until the file is
replaced. `nuc-apply` drops it for the rest of its run. The raw downloads from raw.githubusercontent.com stay anonymous; they don't count.

Calls an hour, at the 5-minute ticks:

| Reader                              | Calls an hour                                     | Signed with                      |
| ----------------------------------- | ------------------------------------------------- | -------------------------------- |
| `self-deploy.sh`                    | 12, up to 24 while checking a deploy that differs | the host token                   |
| `nuc-sync.sh`                       | 24                                                | the host token                   |
| `nuc-apply`                         | 2 per run, only after a merge that changed `nuc/` | the host token                   |
| the platform step, in the container | 2 a collection, every 5–10 minutes: 12–24         | a read-only App token (`run.sh`) |

Anonymous, the host and the platform step alone make 48–72 calls an hour of the IP's 60, before
the Mac makes any. With the token the host's 36 count against the token, and the platform step's
against the App's installation, so the IP's 60 are left to the Mac.

A read that fails is logged each tick and tried again on the next. When GitHub says it is rate
limited (403 or 429 with `x-ratelimit-remaining: 0` or `retry-after`), the log reads `rate limited
until HH:MMZ`, and says so when the read was anonymous or the token was refused.

- `self-deploy.sh`: the hourly limit used up sends one urgent notice at once, any other failed
  read (a short `retry-after` limit included) once it has lasted 30 minutes, and `deploy.json`
  reads `stuck` with the reason, which the desk's Agent health shows. Nothing more until a read
  succeeds; that read puts back the record the stall replaced. A notice the container did not
  take is sent again next tick. The bookkeeping is `readFailingSince` and `readNoticed` in
  `/opt/cdwr-agent/self-deploy.json`. While main cannot be read, a deploy being checked keeps its
  verdict open instead of rolling back at the deadline. A read that works but finds no green build
  in the newest 20 runs is only logged: a failed image build is not a GitHub read failure.
- `nuc-sync.sh`: one notice once the failed reads have lasted 30 minutes (the self-deploy has
  already told a rate limit), kept in `/opt/cdwr-agent/nuc-sync-read.json`. It never touches
  `nuc-apply.json`. A rate-limited `nuc-apply` exits 75, and `nuc-sync` tries the same commit
  again next tick instead of recording it failed.

#### Installing the token

1. On GitHub, as Håkan: Settings → Developer settings → Personal access tokens → Fine-grained
   tokens → Generate new token. Name `cdwr-nuc-read`, resource owner your own account, expiry 1
   year, repository access "Public repositories", no permissions. It reads any public repository,
   `codeware-sthlm/cdwr` included, and can write nothing.
2. On the NUC, as an admin user (`ssh -t hakans@cdwr-nuc`). `read -rs` takes the token without
   echoing it or putting it in the shell history:

   ```sh
   id cdwr
   sudo install -d -m 750 -o root -g cdwr /etc/cdwr-agent
   read -rs t && printf '%s\n' "$t" | sudo install -m 640 -o root -g cdwr /dev/stdin /etc/cdwr-agent/github-read.token; unset t
   sudo -u cdwr bash -c 'curl -fsS -H @<(printf "Authorization: Bearer %s\n" "$(cat /etc/cdwr-agent/github-read.token)") https://api.github.com/rate_limit' | jq .resources.core.limit
   sudo -u cdwr bash -c 'curl -fsS -o /dev/null -w "%{http_code}\n" -H @<(printf "Authorization: Bearer %s\n" "$(cat /etc/cdwr-agent/github-read.token)") "https://api.github.com/repos/codeware-sthlm/cdwr/actions/workflows/agent-host-image.yml/runs?branch=main&per_page=1"'
   ```

   The first check prints `5000`, the second `200`. `/rate_limit` itself is not counted.

3. Within 5 minutes the self-deploy's journal (`journalctl -u cdwr-agent-deploy.service -n 20`)
   no longer says `read anonymously`.

When the token expires, the reads go anonymous again, and a rate limit's notice names the refused
token. Make a new one the same way and replace the file with the `read -rs` line.

### Installing it once

On the NUC, as an admin user (`ssh -t hakans@cdwr-nuc`), once this installer is on main. `sha` is
main's head, read from GitHub. Install the read-only token first ("Installing the token" above):
without it `nuc-sync` draws on the shared anonymous limit and stalls the way the self-deploy did
on 2026-11-22.

```sh
sha="$(curl -fsS -H 'Accept: application/vnd.github.sha' https://api.github.com/repos/codeware-sthlm/cdwr/commits/main)"
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

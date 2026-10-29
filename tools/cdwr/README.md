# cdwr

The Codeware developer CLI: deployments, databases, tenants, secrets, media and releases.

```sh
cdwr                      # the app
cdwr db backup --env production
cdwr fly info --json
cdwr tenant gate close --env preview --tenant demo --generate
cdwr tenant snapshot --definition <path> --json
cdwr <command> --help
```

## Install

```sh
pnpm cdwr setup           # links `cdwr` into ~/.local/bin and installs completion
pnpm cdwr doctor          # what is missing: binaries, credentials, PATH
```

Credentials live in `tools/cdwr/.env` (copy `.env.example`). `pnpm cdwr` works without the setup. Set up once per machine: the linked `cdwr` runs the code of the checkout you are standing in, and falls back to the one it was linked from.

## The app

A bare `cdwr` on a terminal opens a full-screen app: commands on the left, the selected command's
card on the right, and the run itself in the same pane: prompts, plan, log, result. Keys: `↑↓` move,
`⏎` run, `d` dry run, `/` filter, `?` keys, `esc` back, `q` quit. A long run scrolls: `↑↓` a row,
`u`/`d` a page, `g` top, `G` follows the end again. Only a bare `cdwr` opens it.
A command path alone, such as `cdwr db backup`, prompts in the terminal for what it needs, and so
does one with only global flags (`-d`, `-y`, `-v`); once an input is given it never prompts unless
`-i` is given. Without a terminal, or with `--json`, nothing is
drawn and nothing is asked.

## Every command

| Flag                  | Effect                                                  |
| --------------------- | ------------------------------------------------------- |
| `-d`, `--dry-run`     | Print the plan and stop. Safe on any command.           |
| `-y`, `--yes`         | Skip confirmations.                                     |
| `-j`, `--json`        | One JSON document on stdout, no prompts, no spinners.   |
| `-i`, `--interactive` | Ask for what is missing, even with inputs given.        |
| `-v`, `--verbose`     | Show more, such as the full error behind a failure.     |
| `-h`, `--help`        | Flags, what the command needs, and how dangerous it is. |

Every flag has a short alias, shown in `--help` next to the long form.

Flags come first; anything missing is asked for. An input is required unless it is optional or
declares a default, and an empty answer to a required prompt is refused rather than passed along. Without a terminal (CI, an agent) nothing is
asked, and a missing input is a usage error naming the flag. Exit codes: 0 ok, 1 failed, 2 usage, 130 cancelled.

Confirmation follows the command's danger level: read-only commands never ask, everything else
asks wherever it runs, and destructive ones also make you type the target's name on production.
A command prints its plan before asking, so the question is about what you have just read.
Commands that change something append to `~/.cdwr/history.jsonl`; `cdwr history` shows it. A command a script runs on a schedule sets `history: false` in its definition and stays out of it.
Remembered inputs (environment, app) live in `~/.cdwr/prefs.json`.

## Statistics teams

`cdwr tenant stats-teams` moves every workspace that has a statistics website into its own Umami
team: it creates the team, stores its id as `statsTeamId`, adds the cms read key as a view-only
member and moves the website into the team. It needs an admin user's key as `PROVISION_API_KEY` in
`/integrations/umami` and checks that before anything else, also under `--dry-run`. Run
`--dry-run` first: it prints one line per workspace (`acme  create team · move website · add reader`
or `acme  ok`). Applying continues past a failing workspace, ends with a done / ok / failed
summary and exits non-zero if any failed. It is idempotent, so a rerun only does what is missing.

## Statistics accounts

`cdwr tenant stats-accounts` compares each statistics team's members with the admins of its workspace.
Read-only by default: it prints one line per workspace (`acme  2 ok · stale bob@x.se · missing eve@x.se`),
where a member is `ok` when an admin of that workspace with a stored Umami account stands behind it,
`stale` when none does, and an admin with an account who is not in the team is `missing` (the next
action in the stats sheet adds them). It also reports orphan teams (named `cdwr-…`, recorded by no
workspace) and Umami users named like a workspace admin that the cms has no id for (`unlinked`);
those are never changed. The read key's user and the provisioning user are not counted as members.
`--prune` removes the stale members (`DELETE /api/teams/{team}/users/{user}`), and on production asks
for the name to be typed. It needs the admin `PROVISION_API_KEY`, like `stats-teams`. The `unlinked` check
reads Umami's user list, which refuses API keys, so it signs in with `UMAMI_ADMIN_USERNAME` and
`UMAMI_ADMIN_PASSWORD` (a user without 2FA) from `/integrations/umami`; without them it prints a note and skips that check.

## Infisical

`cdwr infisical tenants|data|analysis` read what Infisical holds for tenants and apps, with values
masked unless `--reveal` is given. A deployment ships when its folder holds `DEPLOY_ENABLED=true`
(`/apps/<app>` for a host, `/tenants/<t>/apps/<app>` for a tenant); `tenants` and `analysis` show
each folder as on, off or no flag, and `tenant provision` writes the flag for a new tenant. In production it also gives the tenant its own Umami team (`cdwr-<deployment>`, id stored as `statsTeamId`, the read key added as a view-only member), then creates (or adopts, by domain, within that team) the tenant's Umami website in it and stores its id as `statsWebsiteId`, and gives it a share link stored as `statsShareId`, which the admin's statistics sheet links to; moving a legacy website out of another team needs an admin `PROVISION_API_KEY`, otherwise that part is a warning; without `PROVISION_API_KEY`, `API_KEY` and `UMAMI_URL` the step is skipped. A workspace from self-serve signup (status `pending`, listed first in the choice) is activated once its cms deployment has succeeded and `/api/health` answers; a failure or timeout leaves it pending and a second run finishes the job. `--no-wait` (or `-S`) skips the wait and the activation. Three more work on your own CLI session (`infisical login`, no
token involved) and the same core as the `dev-plugin:infisical-run` executor:

```sh
cdwr infisical session                     # is the CLI installed and logged in
cdwr infisical resolve --path=/apps/cms    # per key: inherited, vault, or vault over committed; values masked
cdwr infisical cache --path=/apps/cms      # refresh apps/cms/.env.offline for OFFLINE=1; counts only, never values
```

`--path` defaults to `/apps/cms`. `--app` names the app that runs when it reads another app's folder
(`--path=/apps/cms --app=headless` uses `apps/headless/.env.offline` and `.env`); it defaults to the path's app. `resolve` follows `OFFLINE` and `CI` as `nx dev` does. `cache`
writes a local file (mode 600, gitignored) so it asks first; `--dry-run` lists the folders it
would read and fetches no value. `nx dx:secrets <app>` runs it.

## Seeing a site

`cdwr tenant snapshot` screenshots a running site: every page of a site definition (or `--routes`),
in each theme, colour scheme and screen size, into a gitignored `.site-snapshots/`. It changes
nothing on the site and needs no credentials, only the site answering at `--url` (the dev server by
default).

It asks the way a visitor does: the theme through the theme cookie, the scheme through the system
preference. A theme the site does not offer, or a scheme it locks, is reported as skipped rather
than saved under a name that claims otherwise. With `--json`, each shot carries its path, the page's
HTTP status and any console errors, which is what an agent reads first after changing something.

## Seeing a story

`cdwr storybook snapshot --story <id,…>` renders Storybook stories to PNG, so UI can be reviewed
(by an agent, which reads the images) without opening Storybook. Each story is drawn on its own page
in every combination of `--themes` (the toolbar's, default `payload-admin`), `--schemes` (`light`,
`dark`) and `--viewports` (`phone`, `desktop`), at twice the pixel density, into the gitignored
`.showcase-images/storybook/` (`--out` to change), named `<story-id>--<theme>-<scheme>-<viewport>.png`.

It serves the static build in `dist/storybook`, building it first when it is missing or with
`--build`. `--url http://localhost:6006` shoots a running Storybook instead, with no build and no
server. A story that draws nothing within 15 seconds is reported and the rest carry on; the command
then exits 1. Story ids are the ones in the story's URL (`?id=…`), or `dist/storybook/index.json`.

```sh
cdwr storybook snapshot --story app-cms-dashboard-sitestatssheetbody--with-data,app-cms-dashboard-sitestatssheetbody--empty
```

## Deploying

`cdwr fly deploy <app> --env preview --pr 566` dispatches the Fly Deployment workflow, so a pull
request can get an app it did not change. The apps offered are the `apps` release group in
`nx.json`. Preview runs from the pull request's branch (`--pr` defaults to the current branch's);
production runs from `main` and asks for confirmation. `--tenant` limits it to one tenant. The run's
URL is reported, and is in the `--json` result.

## Releasing packages

`cdwr release` bumps versions, writes changelogs and tags. The publish itself is left to CI by
default: the workflow stages each package on npm (`pnpm stage publish`) instead of publishing it,
and the release waits there until you approve it with 2FA:

```sh
pnpm stage list                           # what is waiting
pnpm stage approve <stage-id> --otp 123456
```

The stage ids are in the workflow's run summary. Approving is also a button on npmjs.com.

## Rotating the builder token

`cdwr builder rotate-token --env production` rolls over the token the cms sends to the builder
service. The builder first accepts the old and the new token (`BUILDER_TOKEN_PREVIOUS`), then the
cms gets the new one and every cms app restarts, then the old token is retired and the builder
restarts, so nothing is refused on the way. Progress lives in the three Infisical secrets, so an
interrupted run resumes where it stopped. Preview shares one Infisical environment, so a preview
rollover covers every pull request's apps. The token is never printed.

## The agent queue

A launchd job (`se.codeware.agent-queue`), every 10 minutes, runs `/work-queue` plan-only against a
separate worktree, `codeware-agent` beside this checkout. macOS only.

```sh
cdwr agent install        # worktree, env files, deps, script, launchd job, Keychain key
cdwr agent status         # loaded, paused, key, scripts current, watched PRs, next run
cdwr agent run            # start a planning run now
cdwr agent pause|resume   # hold or release the schedule
cdwr agent logs [--run]   # the scheduler log, or the latest run
cdwr agent logs --host <name> [--run]   # the same, from the agent container over ssh
cdwr agent usage [--days 30]   # API-equivalent spend by day, role, model and ticket, from local transcripts
cdwr agent usage-record [--days 3]   # upsert that spend into the telemetry database; --dry-run prints the rows
… | cdwr agent activity [--runs <file>]   # activity rows and a table from a Linear history response on stdin
cdwr agent notify [all|action]   # which notices are sent; no argument shows the level
cdwr agent attend [COD-n] [--path <dir>] [--no-start]   # refresh codeware-queue to origin/main, then start /work-queue there
cdwr agent worktree add COD-529 --branch <name>   # codeware-cod-529 beside this checkout
cdwr agent worktree prune          # remove ticket worktrees whose PR is merged or closed
cdwr agent desk install [--pr <n>] # install the Agent Desk from the newest CI build of main, or of a PR
```

`worktree add` gives each ticket its own checkout, so starting the next never disturbs an earlier
branch: the pushed branch when origin has it, else the local one, else a new one from `origin/main`.
It copies the env files and installs dependencies, and does only what differs. `worktree prune`
removes the `codeware-cod-<n>` checkouts whose pull request is merged or closed, deleting the
branch too when merged. One with no pull request, an open one or uncommitted changes is kept, as
are the agent worktree and the one you run it from. Shell completion stops at `worktree`.

`desk install` downloads the `agent-desk-macos-arm64` artifact of the newest successful `desk.yml`
run (a push to main, or with `--pr` that PR's branch) and replaces `/Applications/Agent Desk.app`,
quitting a running copy first and clearing the quarantine flag the unsigned build needs. It does not
open the app; the settings live outside it and survive. An expired or missing artifact fails in the
plan with the fix: `gh workflow run desk.yml` (`--ref <branch>` for a PR) or `nx tauri-build desk`.
macOS arm64 only.

The script's source is `agent-queue/run.sh`. Launchd runs the copy `install` puts in
`~/.cdwr/agent-queue/`, beside its pause flag and logs, so a merged change does nothing
unattended until the next `install`; `status` and `doctor` say when that copy is out of date. The
script holds the guardrails (read-only tools, Linear the only writable server, no API key), so
review a change to it as one. The launchd job's Linear key is the Keychain's `linear-agent-queue`
(a shell-exported `AGENT_QUEUE_LINEAR_KEY` never reaches the job; the container gets that variable
from compose and files it at start); cdwr checks that it is there and never reads it. `install` asks for the key when it is
missing, and only does what differs, so run it again after the script changes.

The claude runs reach Linear through one of two MCP servers, picked by `AGENT_QUEUE_LINEAR_MCP`
(`lib.sh`). `connector`, the default on the Mac, is the claude.ai connector of the interactive login.
`key`, the default in the container, is Linear's own server at `https://mcp.linear.app/mcp`, signed with
the queue's key: the runs load it with `--strict-mcp-config --mcp-config ~/.cdwr/agent-queue/linear-mcp.json`,
whose `headersHelper` runs `zsh ~/.cdwr/agent-queue/lib.sh header`. That reads the key from
`AGENT_QUEUE_LINEAR_KEY_FILE` (the container's `/run/agent/linear.key`, tmpfs, mode 600) or the Keychain,
so the key is never in the config or on a command line. Claude itself runs without the key in its
environment, and implement-only runs deny reading `/run/agent`. Its tools are `mcp__agent_linear__*`; the allowlists
take the prefix from the same place. The key writes as its owner, as the connector does. Before each
claude run the scripts check that the server answers (`claude mcp list` for the connector, an MCP
`initialize` for the key); without it nothing starts, the run is recorded as `no Linear tools`, one notice
goes out, and `status` shows a `linear tools` warning. Notices go
through `agent-queue/notify.sh "<message>"`, which posts to the webhook in `SLACK_WEBHOOK_URL` (or
`CLAUDE_SLACK_WEBHOOK`, or `~/.claude/slack-webhook`) and does nothing without one. It also reads
`{message, cwd}` JSON on stdin, as a hook; a session under `dontAsk` passes the message as an argument,
since any `$` in a command gets it denied. `--worktree` picks another
checkout and is remembered. The `/work-queue` skill reads `~/.cdwr/agent-queue/notify-level`
(missing means `all`), while the scheduler's own notices (a planned ticket, a failed or capped
run) always go out.

The queue also writes telemetry to its own Supabase project, `agent-queue` (tables `runs`, `usage`,
`activity`, `sessions`, `queue_state`, `issue_events` and `github_events`, schema in `agent-queue/supabase/migrations`, applied by hand). The scripts and
`cdwr agent usage-record` send rows with the service key from `AGENT_SUPABASE_URL` and
`AGENT_SUPABASE_SERVICE_KEY`, read from the environment or the checkout's `tools/cdwr/.env`; both are
optional, and without them nothing is sent. A failed call is a warn line, never a failed run. The
queue writes no Linear document; the Agent Desk reads these tables.

Linear changes reach the desk through the same project. A Linear webhook (team Codeware, Issue and
Comment events) calls the Edge Function `linear-webhook` (`agent-queue/supabase/functions`). The function
checks the `Linear-Signature` HMAC against `LINEAR_WEBHOOK_SECRET` and refuses a `webhookTimestamp` more
than 60 s off. It then upserts one row per issue into `issue_events`: the issue's UUID, its identifier
when the event carries it, and the action, never the payload, since anon can read the table. The desk
hears the row through Realtime and refetches that one issue from Linear. Without the webhook, the desk
reloads every 5 minutes, on focus and on Refresh. Deploy the function after a change to it, with JWT
verification off, since Linear sends no Supabase JWT:

```sh
supabase functions deploy linear-webhook --use-api --no-verify-jwt --project-ref xwmrptothspulojaxrvf --workdir tools/cdwr/agent-queue
```

GitHub changes on `codeware-sthlm/cdwr` land beside them, in `github_events`, for the NUC's scheduler to
wake on. A repo webhook (JSON) sends `pull_request`, `pull_request_review`, `pull_request_review_comment`
and `check_suite` events to the Edge Function `github-webhook`, which checks `X-Hub-Signature-256`
against `GITHUB_WEBHOOK_SECRET`. GitHub sends no timestamp, so a replayed delivery is accepted; it can
only cause an extra wake, which re-reads Linear and GitHub anyway. The function keeps one row per subject:
`pr/<n>` when the event names a pull request, else `ref/<branch>`, with the action (`pull_request:merged`,
`check_suite:completed`, …) and never the payload. A `ping` is answered without a row, and every other
event or action with `Ignored`. Commit statuses aren't subscribed: the required checks and Chromatic run
as Actions jobs, which `check_suite` covers. Both functions share `functions/_shared/hmac.ts`, so a change
to it means deploying both:

```sh
supabase functions deploy github-webhook --use-api --no-verify-jwt --project-ref xwmrptothspulojaxrvf --workdir tools/cdwr/agent-queue
supabase secrets set GITHUB_WEBHOOK_SECRET=… --project-ref xwmrptothspulojaxrvf
```

The daily suggest session is set by `AGENT_QUEUE_SUGGEST_BUDGET_USD` (5), `AGENT_QUEUE_SUGGEST_HOUR` (6) and `AGENT_QUEUE_SUGGEST_DAYS` (1; 0 switches it off), read by `cdwr agent install` into the job: `AGENT_QUEUE_SUGGEST_DAYS=7 cdwr agent install` makes it weekly, `0` turns it off; review whether it earns its keep on 2026-11-16.

A launched implementing session acts on GitHub as the `codeware-agent` GitHub App, never as you:
you sit in the `release` team that bypasses main's rulesets, and an app in no bypass list gets
the branch rules from GitHub itself. `implement.sh` sources `agent-queue/github-app.sh`, which
signs a JWT with `openssl`, exchanges it for an installation token that reaches only `cdwr`, and
hands the session `GH_TOKEN`, an env-only git credential helper (GitHub over SSH is rewritten to
HTTPS, so your key is never offered) and the bot's commit identity. It reads three variables
from `tools/cdwr/.env`, the copy `install` keeps in the agent worktree: `AGENT_GITHUB_APP_ID`,
`AGENT_GITHUB_APP_INSTALLATION_ID` and `AGENT_GITHUB_APP_KEY_PATH`, a `.pem` outside every
checkout with mode 600. One of them missing or wrong, or a refused exchange, means no session
and a notice saying why; it never falls back to your `gh` login. `doctor` runs the same exchange
and shows what the token reaches. The app's permissions: Contents and Pull requests read and
write, Metadata, Checks and Actions read; installed on `cdwr` only, in no ruleset bypass list.

The agent container (`apps/agent-host`) reads its secrets from Infisical at start: `secrets.sh`, its
entrypoint, logs in with a machine identity, exports production `/agent-queue` and then execs the run
loop, so the loop is still the process `docker compose stop` signals. The folder lives in its own
Infisical project, `agent-host`, which holds nothing else, and the identity is a Viewer there and a
member of no other project: the free plan cannot limit an identity to a folder, so the project is
the limit. The NUC holds only the identity (`INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`,
`INFISICAL_PROJECT_ID` of that project, `INFISICAL_SITE`) in a `.env` only the deploy user can read; a key set there
wins over the vault, and the log names which keys came from where, never their values. The identity
is unset before the loop starts, but PID 1 keeps it in its environment, readable by the agent's own
sessions; that is why it must stay a Viewer of that one project. Without the identity the container
uses its environment as given. Secrets are read once per start, so a rotated one takes a
`docker compose restart`. Claude runs on `CLAUDE_CODE_OAUTH_TOKEN`, a long-lived token from
`claude setup-token` on the Mac, which keeps billing on the subscription.

Before it plans, the scheduler watches the PRs of `agent:review` tickets (open, or done within 14
days) without starting Claude. It sends one notice per change: a PR that left the merge queue
or has failing checks (`action`), a merge with the hand-offs still unticked in the agent's
`**Agent: PR ready**` comment (`action`), and a plain merge or a close (`info`, which follows
the level). `~/.cdwr/agent-queue/watch.json` remembers what was last sent, and `status` shows
it. `gh` runs as you here, so the script only lists and queries; a spec fails on anything
else. The watch's decisions live in `agent-queue/watch.jq`, installed beside `run.sh`, rather
than in a `*.logic.ts`: what runs unattended stays behind `install`, and jq is already a
dependency of the script. Its spec runs it through `jq`.

A run reports to a Sentry cron monitor, `agent-queue`, when `SENTRY_DSN` is set (the agent
container reads it from `/agent-queue` in Infisical; unset, as on the Mac, nothing is sent).
`agent-queue/checkin.sh`, sourced by `run.sh`, posts to Sentry's HTTP check-in endpoint with curl:
`in_progress` once the run holds its lock, `ok` or `error` by exit status when it ends. Every
check-in carries the monitor's config, so whichever reaches Sentry first creates the monitor and
the rest keep it in step (upsert): every 10 minutes, a
15-minute margin, which makes a missed check-in alert after 25 minutes, and a 60-minute max
runtime. A paused queue still sends an `ok` on each tick, since a pause is deliberate; a tick that
finds a run in progress, a `--check`, and a run that skips for a missing Linear key or no network
send nothing, so a key that stays missing alerts as missed check-ins. A failed check-in is logged once to
`scheduler.log` and never fails the run.

`cdwr agent logs --host <name>` reads the log of the agent container instead of a local file: it
runs `ssh <name> docker exec cdwr-agent` to list `/home/agent/.cdwr/agent-queue/logs`, picks the
scheduler log or, with `--run`, the latest run, and tails it. It needs no local launchd job.

## The NUC

The agent container runs on a NUC. Everything below is done once; after that `cdwr agent deploy`
updates it. The machine is named after its hardware (`cdwr-nuc`); everything the queue reaches it by
is named after its role, `agent-host`, so moving to another box changes only the machine.

1. Install Ubuntu Server 24.04 LTS.
2. Install Docker Engine from Docker's apt repository, following
   [the official guide](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository).
3. Keep the host patched: `apt install unattended-upgrades`, then in
   `/etc/apt/apt.conf.d/50unattended-upgrades`:

   ```txt
   Unattended-Upgrade::Automatic-Reboot "true";
   Unattended-Upgrade::Automatic-Reboot-Time "04:00";
   ```

4. In the BIOS, set power on after AC loss.
5. Join the tailnet with Tailscale SSH and the role's tag, and forward no router ports:

   ```sh
   sudo tailscale up --ssh --advertise-tags=tag:agent-host
   ```

   The tailnet policy needs `"tagOwners": {"tag:agent-host": ["autogroup:admin"]}` first. A tagged
   device has key expiry off.

6. Create the deploy user `cdwr`, in the `docker` group, and its directory:

   ```sh
   sudo adduser --disabled-password cdwr
   sudo usermod -aG docker cdwr
   sudo install -d -o cdwr -g cdwr /opt/cdwr-agent
   ```

   Tailscale SSH needs a rule letting you in as `cdwr`, aimed at the tag rather than the machine:

   ```json
   { "action": "accept", "src": ["autogroup:admin"], "dst": ["tag:agent-host"], "users": ["cdwr"] }
   ```

   On the Mac, an ssh alias names the role, so `--host agent-host` outlives the hardware:

   ```txt
   Host agent-host
     HostName cdwr-nuc
     User cdwr
   ```

7. Write `/opt/cdwr-agent/.env` from `apps/agent-host/.env.example`, with the Infisical identity
   (`INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, `INFISICAL_PROJECT_ID`, `INFISICAL_SITE=eu`).
   It is owned by `cdwr`, not root, with mode 600, since `docker compose` reads `env_file` as
   the user who runs it:

   ```sh
   sudo install -m 600 -o cdwr -g cdwr /dev/null /opt/cdwr-agent/.env
   ```

8. Install the nightly backup of the `agent-home` volume (03:30, the newest 14 tarballs kept in
   `/var/backups/cdwr-agent`), from `apps/agent-host/nuc` in this repo:

   ```sh
   sudo install -m 755 backup-agent-home.sh /usr/local/sbin/
   sudo install -m 644 cdwr-agent-backup.service cdwr-agent-backup.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now cdwr-agent-backup.timer
   ```

9. From the Mac, the first deploy. The image is public, so the NUC pulls without a login:

   ```sh
   cdwr agent deploy --host agent-host
   ```

10. Check it. `cdwr agent logs --host agent-host` lands with COD-592; until then, on the NUC:

    ```sh
    docker logs cdwr-agent
    cd /opt/cdwr-agent && docker compose --env-file image.env run --rm agent claude -p 'say ok'
    ```

    The second answers without a login prompt.

`cdwr agent deploy` ships `apps/agent-host/compose.yaml`, pauses the queue, waits up to `--wait`
minutes (default 30) for the running job to finish, writes the tag to `image.env`, pulls,
restarts and resumes. Without `--tag` it takes the latest image built on main; `--dry-run` prints
the plan with the resolved tag. When the queue stays busy it resumes and changes nothing.

`cdwr agent status --host agent-host` reads the queue's status from the Mac: it runs `agent status`
in the container over ssh, through `/opt/agent-host/secrets.sh` so the report sees the vault's
secrets, and renders the answer as a local run would.

An attended `/work-queue` on the Mac stays visible to the NUC through its session file, which the
Mac's session hook copies into the container at every change and at least once a minute. That way
the NUC launches no implementing session while one is alive on the Mac. The hook runs from the
checkout the session was started in (`$CLAUDE_PROJECT_DIR`), so that checkout must be on a main
that includes the mirror support; `cdwr agent attend` moves it there. Set the target once on the
Mac:

```sh
cdwr agent mirror set --host agent-host   # checks over ssh that the container's sessions directory is writable
cdwr agent mirror clear                   # stop mirroring
```

The NUC treats a file from another host as alive for three hours while it waits at a prompt or
polls, and otherwise while its heartbeat is under 15 minutes old. It deletes the file after a day.

## Writing a command

One file under `src/commands/<group>/`, one entry in `src/commands/index.ts`:

```ts
export default defineCommand({
  summary: 'Back up the CMS database with pg_dump',
  danger: 'read',                     // read | mutate | destructive | spends-money
  needs: ['pg_dump', 'infisical'],    // checked before anything runs
  inputs: { environment: environmentInput() },
  async plan(ctx, { environment }) {  // reads only; what --dry-run shows
    return { steps: ['Dump schema', 'Dump data'], target: { environment }, data: {...} };
  },
  async apply(ctx, data) {            // writes; report through ctx.ui
    return { summary: 'Backup written', next: [], json: data };
  }
});
```

The runtime parses flags and runs with what it was given; a command path alone (or with only global
flags) prompts for the rest, as does `-i`. It then prints the plan, confirms, runs `apply`, prints
the outro, writes `--json` and records history. Commands never call `process.exit`, `console`,
`dotenv` or clack directly. `src/commands/db/backup.ts` and `src/commands/fly/restart.ts` are the
templates; `src/services/` holds the shared I/O (Fly, Infisical, database tunnels, backups, shell,
GitHub). Pure logic goes in a sibling `<command>.logic.ts` with a spec.

```sh
pnpm nx test cdwr
pnpm nx lint cdwr
pnpm nx typecheck cdwr
```

## Layout

```
bin/cdwr.mjs      the shim `cdwr setup` links onto PATH; runs the current checkout's src/main.ts through tsx
src/main.ts       argv → registry → runtime, inside the app on a terminal
src/cli/          runtime: command contract, inputs, args, resolve, run, help, completion, prefs, history, preflight
src/ui/           theme, banner, the Ink app (`app/`), plain and silent UIs
src/ui/app/       the app runs each command in a worker thread (`worker.ts`, `bridge.ts`) so the screen never freezes
src/services/     shared I/O
src/commands/     one file per command, grouped
```

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

On a terminal, `cdwr` opens a full-screen app: commands on the left, the selected command's card on
the right, and the run itself in the same pane: prompts, plan, log, result. `cdwr db backup` opens
the app straight on that command. Keys: `↑↓` move, `⏎` run, `d` dry run, `/` filter, `?` keys,
`esc` back, `q` quit. Without a terminal, or with `--json` or `--non-interactive`, nothing is drawn
and nothing is asked.

## Every command

| Flag                | Effect                                                          |
| ------------------- | --------------------------------------------------------------- |
| `--dry-run`         | Print the plan and stop. Safe on any command.                   |
| `--yes`             | Skip confirmations.                                             |
| `--json`            | One JSON document on stdout, no prompts, no spinners.           |
| `--non-interactive` | Never prompt; a missing input is a usage error naming the flag. |
| `--help`            | Flags, what the command needs, and how dangerous it is.         |

Flags come first; anything missing is asked for. An input is required unless it is optional or
declares a default, and an empty answer to a required prompt is refused rather than passed along. Without a terminal (CI, an agent) nothing is
asked. Exit codes: 0 ok, 1 failed, 2 usage, 130 cancelled.

Confirmation follows the command's danger level: read-only commands never ask, everything else
asks wherever it runs, and destructive ones also make you type the target's name on production.
A command prints its plan before asking, so the question is about what you have just read.
Commands that change something append to `~/.cdwr/history.jsonl`; `cdwr history` shows it.
Remembered inputs (environment, app) live in `~/.cdwr/prefs.json`.

## Seeing a site

`cdwr tenant snapshot` screenshots a running site: every page of a site definition (or `--routes`),
in each theme, colour scheme and screen size, into a gitignored `.site-snapshots/`. It changes
nothing on the site and needs no credentials, only the site answering at `--url` (the dev server by
default).

It asks the way a visitor does: the theme through the theme cookie, the scheme through the system
preference. A theme the site does not offer, or a scheme it locks, is reported as skipped rather
than saved under a name that claims otherwise. With `--json`, each shot carries its path, the page's
HTTP status and any console errors, which is what an agent reads first after changing something.

## Deploying

`cdwr fly deploy <app> --env preview --pr 566` dispatches the Fly Deployment workflow, so a pull
request can get an app it did not change. The apps offered are the `apps` release group in
`nx.json`. Preview runs from the pull request's branch (`--pr` defaults to the current branch's);
production runs from `main` and asks for confirmation. `--tenant` limits it to one tenant. The run's
URL is reported, and is in the `--json` result.

## Rotating the builder token

`cdwr builder rotate-token --env production` rolls over the token the cms sends to the builder
service. The builder first accepts the old and the new token (`BUILDER_TOKEN_PREVIOUS`), then the
cms gets the new one and every cms app restarts, then the old token is retired and the builder
restarts, so nothing is refused on the way. Progress lives in the three Infisical secrets, so an
interrupted run resumes where it stopped. Preview shares one Infisical environment, so a preview
rollover covers every pull request's apps. The token is never printed.

## The agent queue

An hourly launchd job (`se.codeware.agent-queue`) runs `/work-queue` plan-only against a
separate worktree, `codeware-agent` beside this checkout. macOS only.

```sh
cdwr agent install        # worktree, env files, deps, script, launchd job, Keychain key
cdwr agent status         # loaded, paused, key, script current, what the next run would take
cdwr agent run            # start a planning run now
cdwr agent pause|resume   # hold or release the schedule
cdwr agent logs [--run]   # the scheduler log, or the latest run
```

The script's source is `agent-queue/run.sh`. Launchd runs the copy `install` puts in
`~/.cdwr/agent-queue/`, beside its pause flag and logs, so a merged change does nothing
unattended until the next `install`; `status` and `doctor` say when that copy is out of date. The
script holds the guardrails (read-only tools, Linear the only writable server, no API key), so
review a change to it as one. The Linear key lives in the Keychain under `linear-agent-queue`;
cdwr checks that it is there and never reads it. `install` asks for it when it is missing, and
only does what differs, so run it again after the script changes. `--worktree` picks another
checkout and is remembered.

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

The runtime parses flags, prompts for the rest, prints the plan, confirms, runs `apply`, prints
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

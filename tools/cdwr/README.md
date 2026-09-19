# cdwr

The Codeware developer CLI: deployments, databases, tenants, secrets, media and releases.

```sh
cdwr                      # menu
cdwr db backup --env production
cdwr fly info --json
cdwr tenant gate close --env preview --tenant demo --generate
cdwr <command> --help
```

## Install

```sh
pnpm cdwr setup           # links `cdwr` into ~/.local/bin and installs completion
pnpm cdwr doctor          # what is missing: binaries, credentials, PATH
```

Credentials live in `tools/cdwr/.env` (copy `.env.example`). `pnpm cdwr` works without the setup.

## Every command

| Flag                | Effect                                                          |
| ------------------- | --------------------------------------------------------------- |
| `--dry-run`         | Print the plan and stop. Safe on any command.                   |
| `--yes`             | Skip confirmations.                                             |
| `--json`            | One JSON document on stdout, no prompts, no spinners.           |
| `--non-interactive` | Never prompt; a missing input is a usage error naming the flag. |
| `--help`            | Flags, what the command needs, and how dangerous it is.         |

Flags come first; anything missing is asked for. Without a terminal (CI, an agent) nothing is
asked. Exit codes: 0 ok, 1 failed, 2 usage, 130 cancelled.

Confirmation follows the command's danger level: read-only commands never ask, mutating ones ask
on production, destructive ones always ask and make you type the target's name on production.
Commands that change something append to `~/.cdwr/history.jsonl`; `cdwr history` shows it.
Remembered inputs (environment, app) live in `~/.cdwr/prefs.json`.

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
bin/cdwr.mjs      the shim `cdwr setup` links onto PATH; runs src/main.ts through tsx
src/main.ts       argv → registry → runtime, or the menu
src/cli/          runtime: command contract, inputs, args, resolve, run, help, completion, prefs, history, preflight
src/ui/           theme, banner, terminal and silent UIs, menu
src/services/     shared I/O
src/commands/     one file per command, grouped
```

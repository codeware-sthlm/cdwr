<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

## Workspace constraints

- Use pnpm
- Use Node 22
- Entire repository is ESM (`"type": "module"`)

## Working conventions

- Prefer Nx-native generators/executors over ad hoc scripts
- Prefer ESM-compatible implementations
- Match existing local plugin/package conventions before introducing new patterns
- Prefer explicit project targets over inferred tasks unless a natural config file already exists
- Avoid adding new dependencies unless clearly justified
- Pin a dependency family released in lockstep (Nx, Payload, Remix, Storybook, Vitest, Tailwind, Playwright, Jest) exact on every member; a caret on one member floats on the next lockfile refresh while the rest stay put. Independent packages keep a caret. The `dev-plugin:lockstep-versions-sync` sync generator enforces this on the root `package.json`; `nx sync` then `pnpm install` fixes a split
- Do not add CI integration unless explicitly asked
- Before making large structural changes, summarize the conventions found in the repo and the planned approach
- Git commits should follow conventional commit pattern in commitlint.config.cjs
- Commit messages should be short — single line preferred; no multi-paragraph explanations
- Never add `Co-Authored-By` trailers to commits
- Never push directly to main — always create a branch and open a PR

## Agent queue

Tickets carrying a Linear `agent:*` label (Agent group, Codeware team) are worked by the
`/work-queue` skill (`.claude/skills/work-queue`). It plans into the ticket, hands planned
steps to the `implementer` subagent (`.claude/agents/implementer.md`, Sonnet) in a worktree
per ticket, asks in Linear instead of waiting in the terminal, and keeps going until a limit
of what waits on Håkan. The skill holds the queue order, the labels and how a gate asks.
When a split's sub-issue has all its blockers done, the queue lists it as ready to label
(`COD-n label`) among what waits on Håkan; only he sets `agent:ready`.

To start an attended session, run `cdwr agent attend [COD-n]` from anywhere: it moves `codeware-queue` to `origin/main` (installing when the lockfile changed) and starts `/work-queue` there in the same terminal (`--no-start` prints the line instead). A session started on a detached checkout that is behind main warns at start and names that one command (the SessionStart hook, `tools/cdwr/agent-queue/session-start.sh`).

The scheduler runs in the NUC's agent container, plan-only every 10 minutes; `cdwr agent status --host <host>` says what it would take next. The Mac is attended-only: `cdwr agent install` still sets up a launchd job there, and `cdwr agent uninstall` removes it (`--worktree-remove` takes the planner checkout too) and keeps the session side. Without the job, bare `status` shows the attended rows and `pause`, `resume` and `run` name the host that has the scheduler. Launchd runs an installed copy of
`tools/cdwr/agent-queue/run.sh` (and its `watch.jq`, `waits.sh`, `implement.sh` and `github-app.sh`), so a merged change to its guardrails
waits for the next `install`. Before planning, the same job watches the PRs of `agent:working`,
`agent:needs-input` and `agent:review` tickets and sends a notice when a review PR leaves the merge
queue or fails, or any of them merges with hand-offs left. A ticket merged outside review is
relabelled `agent:review` with a **Next:** line naming its hand-offs, the job's one Linear write.
In the NUC's container the loop wakes on Linear and GitHub events (`cdwr agent listen` on Supabase Realtime, publishable key `AGENT_SUPABASE_ANON_KEY`), with a run every hour as the fallback; without the listener it polls every 10 minutes.
Each run also sends its telemetry to the `agent-queue` Supabase project, which the Agent Desk reads: tables `runs`, `usage` (`cdwr agent usage`), `usage_hours` (the same spend per whole UTC hour over every Claude project on the host, sent every run and kept 14 days), `activity` (`cdwr agent activity`, from Linear's issue history), `sessions`, `queue_state`, `host_metrics` (the container's load, memory and disk, kept 7 days; the desk's NUC tile), `plan_usage` (the plan's 5-hour and weekly usage from the Mac's status line, `cdwr agent statusline install`; the desk's Plan usage tile, with `usage_hours` as its hourly breakdown), and `issue_events` written by the `linear-webhook` Edge Function, `github_events` and `builds` by `github-webhook` (env `AGENT_SUPABASE_URL` and `AGENT_SUPABASE_SERVICE_KEY`). It writes no Linear document.
The `queue_state` row carries an `Attended:` line saying whether an attended `/work-queue` has something to do, and `cdwr agent status` shows it too.
Once a day, in the first idle run after 06:00, the job runs `/suggest-improvement`, which proposes one evidence-led improvement as a `Source: agent-idea` ticket or records "nothing today"; the `queue_state` row's `Suggested:` line and `cdwr agent status` show it. Accept it with `agent:ready`, discard it by cancelling with one word in a comment.

When that work waits and no session is alive, the job starts one itself: `implement.sh` runs
`claude -p "/work-queue implement-only once"` detached, with deny-by-default permissions, a
per-run budget (`AGENT_QUEUE_IMPLEMENT_BUDGET_USD`, $15) and a daily cap
(`AGENT_QUEUE_IMPLEMENT_CAP_USD`, $40) kept in `implement-spend.jsonl`. It resumes approved,
answered or reviewed work only, and never starts a new ticket. It reaches Linear through the
claude.ai connector on the Mac and, in the container, through Linear's own MCP server signed with
the queue's key (`AGENT_QUEUE_LINEAR_MCP`, see `tools/cdwr/README.md`); a run without Linear tools
doesn't start. On GitHub it acts as the
`codeware-agent` app (`github-app.sh`, credentials in `tools/cdwr/.env`), never as Håkan, so
main's rulesets apply to it; without the app it does not start. After two launches that change
nothing it stops and sends the "Start /work-queue" notice instead. `cdwr agent pause` stops
launching too.

An attended Mac session stays visible to the NUC because its session hook copies each session file into the NUC's container (`cdwr agent mirror set --host agent-host`, once). So the NUC starts no implementing session while one is alive on the Mac. The hook runs from the checkout the session started in, which must be on a main that includes the mirror support: `cdwr agent attend` does that.

## Nx-generated projects cleanup

- ensure project name reflects the project path for a consistent and unique pattern
- remove auto-generated spec files that hasn't been evolved
- remove redundant project targets that is already inferred by plugins
- remove README.md when it doesn't contain valuable DX focused content

## Common Commands

### Shadcn UI Components

```sh
# Add a new component
nx shadcn:add -- <component>
```

### CMS Development

Ensure Posgres cluster is running.

```sh
# Start Postgres container when needed
nx dx:postgres cms
```

#### Dev email

Mail sent in development goes to a local catcher — no account, nothing to expire:

```sh
# Start Mailpit; inbox on http://localhost:8025, SMTP on 1025
nx dx:mail cms
```

Point `apps/cms/.env.local` at it (personal overrides; `.env` holds the shared defaults):

```sh
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM_ADDRESS=dev@codeware.local
SMTP_FROM_NAME=Codeware Dev
```

`SMTP_HOST`/`SMTP_PORT` take any relay, not just a credential-less local
catcher — set `SMTP_USERNAME`/`SMTP_PASSWORD` too for an authenticated one
such as Mailtrap. With nothing configured at all, development falls back to
a disposable Ethereal inbox created on the first send, and logs a per-message
preview link. Nothing is dropped silently.

#### Dev secrets

The `dev`, `seed`, `reset-db` and `verify` targets run through the `dev-plugin:infisical-run`
executor, which reads the app's Infisical folder with your CLI session. Precedence: committed `.env` < vault < anything set on
purpose (target env, `.env.local`, the shell). `OFFLINE=1` uses `apps/<app>/.env.offline`
instead, refreshed with `nx dx:secrets <app>`; `CI` skips the vault. `cdwr infisical resolve`
shows where each key comes from, `cdwr infisical session` whether you are logged in.
headless's `dev` reads only the cms's `/apps/cms/signature`, so it signs as the cms verifies; its
offline copy is still its own `apps/headless/.env.offline` (`--app=headless`).

#### Custom component builds

Saving a custom component builds it. In development the cms builds in-process
from the workspace on disk. Production has no toolchain in the cms image and
calls the builder service (`apps/builder`) instead; a cms without
`BUILDER_URL` and without a toolchain marks every build as failed.

To run the service locally and make the cms use it, the way production does:

```sh
# Terminal 1: the service on http://localhost:3002, token `dev-token`
nx serve builder

# Or the image production runs, built from the repo root
docker build -f apps/builder/Dockerfile -t builder .
docker run --rm -p 3002:3002 -e BUILDER_TOKEN=dev-token builder
```

```sh
# apps/cms/.env.local — unset both to build in-process again
BUILDER_URL=http://localhost:3002
BUILDER_TOKEN=dev-token
```

The same two values reach the deployed cms apps from Infisical (`/apps/cms/`),
and the service reads its token from `/apps/builder/`. On Fly the url
is the service's public address, `https://cdwr-builder.fly.dev`; the
token is what keeps it closed. Preview apps are named after their pull
request, so the preview value carries the placeholder every app url does,
`https://cdwr-builder-pr-${PR_NUMBER}.fly.dev`, expanded by the cms at boot.
It resolves only when that PR deployed the builder, which happens when the
builder changed; otherwise `cdwr fly deploy` sends it there. Deployed without
a token the service stays up and refuses every build, so a missing secret
shows in the admin rather than as a failed deploy.

The service logs one JSON line per outcome (`listening`, `build received`, `build finished`, `build refused`) tagged with a request id, never the token or the source; the cms sends the id as `x-request-id` and names it in `The build service did not answer (request <id>)`, so `fly logs -a cdwr-builder` filtered on that id finds the matching line.

The studio's editor type-checks against the same declarations the build uses: `nx studio-types cms`
collects them into `apps/cms/public/studio-types.json` (gitignored, cached on the lockfile and the kit).
`build` depends on it and `dev` runs it first, inline. The admin loads it from `/studio-types.json`;
without the file the editor is syntax-only and the build still decides.

Rotating the token is `cdwr builder rotate-token`: the service accepts the previous token
(`BUILDER_TOKEN_PREVIOUS`) while the cms switches over, so nothing is refused on the way.

#### Site statistics (Umami)

`apps/umami` wraps the upstream Umami image; bump the pinned tag in its Dockerfile, via PR, to upgrade.
It runs as `cdwr-umami` on Fly, production only: only `/apps/umami` in production has `DEPLOY_ENABLED`.
Its `DATABASE_URL` (Supabase, `?schema=umami`) and `APP_SECRET` are Fly secrets set by hand, since the
image cannot read Infisical, and the app receives no shared secrets (`sharedSecrets: false` in its
`github.json`). The first deploy needs the app and secrets to exist first, in this order:

```sh
fly apps create cdwr-umami
fly secrets set DATABASE_URL=… DIRECT_DATABASE_URL=… APP_SECRET=… -a cdwr-umami --stage
```

`DATABASE_URL` is Supabase's **transaction** pooler (port 6543), never the session pooler (5432):
Umami opens a pool of up to 10 connections per machine, and the session pooler's 15 clients run out
(`EMAXCONNSESSION`), which takes every statistics read down. `DIRECT_DATABASE_URL` is the session
pooler or the direct connection, since migrations run at every boot and need a session. Keep the app
at one machine; `fly status -a cdwr-umami` should list exactly one. A deploy keeps the app's live Fly
config, so a change to `apps/umami/fly.toml` reaches the app only through
`cdwr fly patch --patch always-on-small --apps cdwr-umami`. Umami's migrations create an `admin` / `umami` account, so change that password
before the app is ever public: run the same image locally against the same database, sign in on
`localhost:3000` and change it there. Only then set `DEPLOY_ENABLED=true` in production `/apps/umami`.

```sh
docker run --rm -p 3000:3000 -e DATABASE_URL=… -e DIRECT_DATABASE_URL=… -e APP_SECRET=… ghcr.io/umami-software/umami:<tag>
```

The API token the cms uses lives in Infisical `/integrations/umami`.

#### CMS admin components + import map

Payload resolves custom admin components (`admin.components.*` in `payload.config.ts`) through the
committed import map at `apps/cms/src/app/(payload)/admin/importMap.js`. Payload only regenerates it
in `dev` — the committed map is what the production build/runtime uses. So whenever you **add, remove,
or re-path an admin component**, regenerate and commit it, or the component silently fails to load:

```sh
nx payload cms generate:importmap
```

#### Content Security Policy

The cms sends one, built by `@codeware/shared/util/csp` in `apps/cms/src/proxy.ts`; `apps/headless` builds its own in `src/server/csp.ts`, from its global request middleware. Framing, plugins, `base-uri` and form targets are always
enforced. The full policy — a per-request nonce with `'strict-dynamic'` for scripts — goes out
`Content-Security-Policy-Report-Only` until `CSP_ENFORCE=true`. A new third-party origin has to be
added there, or it breaks the site once enforcement is on.

Violations go to Sentry's security endpoint, derived from `SENTRY_DSN`. In Sentry they are
issues of type _CSP_; without a DSN, locally, they appear only in the browser console.

#### CMS Host mode

Ensure `TENANT_ID` has no value in `apps/cms/.env.local`.

```sh
# Terminal 1: Serve the Payload admin UI (auto-seeds on start)
nx dev cms

# Terminal 2 (optional): the headless client, as tenant moon
nx dev headless
```

| View            | URL                     | Credentials                  |
| --------------- | ----------------------- | ---------------------------- |
| Tenant admin UI | `localhost:3000/admin`  | `titan@local.dev` / `dev`    |
| CMS admin UI    | `localhost:3000/admin`  | `system@local.dev` / `dev`   |
| Signup          | `localhost:3000/signup` | invite `SEED-MANY-0000-0001` |
| Headless client | `localhost:4300`        |                              |

The seed opens signup and creates that code (and a single-use `SEED-ONCE-0000-0001`),
on a fresh database only; a preview is ready to take a signup as soon as it boots.
The verification and notice mails go wherever the environment's SMTP points.

System users and workspace admins must set up a TOTP authenticator at their first
sign-in. `nx dev cms` (and so `cms-e2e`) sets `TOTP_EXEMPT_SEEDED_USERS=true`, which
lets the seeded `@local.dev` users skip it; the env schema refuses the flag outside
development.

#### CMS Tenant mode

Ensure `TENANT_ID` is set to `'moon'` in `apps/cms/.env.local`.

```sh
# Serve the Payload tenant client and admin UI (auto-seeds on start)
nx dev cms
```

| View            | URL                    | Credentials                |
| --------------- | ---------------------- | -------------------------- |
| Tenant client   | `localhost:3000`       |                            |
| Tenant admin UI | `localhost:3000/admin` | `titan@local.dev` / `dev`  |
| CMS admin UI    | `localhost:3000/admin` | `system@local.dev` / `dev` |

### Database Operations

```sh
# Reset database for a fresh start
nx reset-db cms

# Seed database
nx seed cms
```

### The cdwr CLI (database / Fly.io / tenants / Infisical / media / release)

```sh
pnpm cdwr                         # the app; `cdwr` after `pnpm cdwr setup`
cdwr <group> <command> --help     # db, fly, tenant, infisical, signature, media, agent, release
cdwr db backup -i --env production   # flags first, -i asks for the rest
cdwr fly info --json              # machine output, never prompts
cdwr tenant gate close --dry-run  # the plan, nothing applied
```

`tools/cdwr` holds it; see [tools/cdwr/README.md](tools/cdwr/README.md) for the command
contract. Every command takes `-d/--dry-run`, `-y/--yes`, `-j/--json` and `-i/--interactive`. Only a bare
`cdwr` opens the app. A command prompts for what is missing until one of its own inputs is given;
global flags such as `-d` or `-v` don't count. Once an input is given it never prompts unless `-i`
asks it to. Danger
levels decide confirmations: destructive commands make you type the target's name on
production. Credentials go in `tools/cdwr/.env`; `cdwr doctor` says what is missing.

`media generate-images` is the only command that **spends money** — it bills Replicate per
image. It writes to a gitignored `.showcase-images/` and never uploads: the gallery's
examples end up in Chromatic snapshots, so replacing one is a deliberate visual review.

### Release Packages

```sh
# Interactive release process (generates changelog, bumps versions, creates GitHub releases)
cdwr release        # or `nx release-cli`, an alias
```

### Commits

```sh
# Interactive conventional commit (czg)
pnpm run c
```

## Architecture

### Monorepo Structure

```txt
apps/        # Deployable applications
packages/    # Publishable npm packages (@cdwr/*)
libs/        # Internal shared libraries (@codeware/*)
tools/       # Internal tools and plugins
e2e/         # End-to-end tests
```

### Applications

**`apps/cms`** — the platform itself: Payload CMS v3 on Next.js 16, serving the admin UI and the tenant-facing site from one app (`(payload)` and `(site)` route groups). **This is the preferred client for a tenant** — deployed in tenant mode it serves that tenant's site with its admin pages scoped to it. Uses PostgreSQL, S3 storage, Lexical rich text, and Sentry for error tracking.

The Remix showcase `apps/web` is retired; a TanStack Start client, `apps/headless`, replaces it (COD-611).

### Publishable Packages (`packages/`)

Only these three are published to npm:

| Package                   | Purpose                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `@cdwr/nx-payload`        | Nx plugin adding Payload CMS generators/executors to any Nx workspace |
| `@cdwr/create-nx-payload` | Preset to scaffold a new Nx workspace with Payload                    |
| `@cdwr/fly-node`          | Programmatic Node.js wrapper for the Fly CLI                          |

**Internal-only building blocks also under `packages/`** (not published — consumed in this
repo's own workflows via `uses: ./packages/<name>`): the GitHub Action packages
`fly-conditions-action`, `fly-build-action`, `fly-deployment-action`, `fly-destroy-action`,
`pr-comment-action`, `nx-pre-deploy-action`, `nx-migrate-action`. A GitHub Action is not
consumable from npm, so these carry `private: true` and are excluded from `nx release`.

> Do not add a package that depends on an unpublished `@codeware/*` lib — a published package
> may only depend on other published packages or code it fully bundles.

### Internal Libraries (`libs/`)

**`libs/app-cms/`** — CMS-specific code organized in layers:

- `data-access/` — Payload collections and DB schema
- `feature/` — env-loader, seed
- `ui/` — blocks, components, fields, Lexical plugins, tabs
- `util/` — access control, db utils, email, env schema, filters, hooks, plugins

**`libs/shared/ui/`** — React component library (shadcn/Radix UI based): cms-renderer, code highlighting, color-picker, copy-button, file-area, icon-picker, image, primitives, shadcn components, video.

**`libs/shared/util/`** — Utility libraries: `github` (GitHub Actions/API helpers), `misc` (node/process/CLI utils), `node`, `nx-deploy` (Nx affected-apps deploy analysis), `payload-api`, `payload-types`, `payload-utils`, `pure`, `release` (Nx release CLI), `schemas`, `seed`, `signature`, `tailwind`, `testing` (+ `/vitest` schema-test helpers), `typesafe`, `ui`, `zod`.

**Internal-lib build convention:** internal libs are **not buildable** — they have no `build` target and are consumed by bundling their _source_ via `@codeware/*` tsconfig path aliases (nothing consumes a lib's `dist`), so `enforceBuildableLibDependency` is disabled workspace-wide. A lib only needs a private `package.json` (no `publishConfig`, `private: true`) when it imports an **un-bundleable** dep — a native `.node` module or a package with unresolvable dynamic requires — so esbuild externalizes it in every consumer that bundles it. Today only `nx-deploy` (`@nx/devkit`) and `misc` (`node-pty`) need one; consumers list those in the `@nx/dependency-checks` `ignoredDependencies`.

> ⚠️ Any such private `package.json` **must include `"type": "module"`** (the repo is ESM). Without it, node treats that lib's files as CommonJS, and a `tsx`-run script that imports the lib's barrel fails with `does not provide an export named …` (this broke the `release-cli` target and `pnpm cdwr`). Files under a package.json inherit its module type, not the root's.
>
> These manifests are **generated and guarded** by the `dev-plugin:externalize-deps-sync` global sync generator (registered in `nx.json` → `sync.globalGenerators`, enforced in CI via `nx sync --check`). It scans each `libs/` project's source imports against a curated denylist of un-bundleable packages, and for any lib that **both** imports one **and** is reached by a bundling consumer (esbuild/webpack — `tsx`-only libs like `release` are skipped), it ensures a private `package.json` exists declaring those deps (pinned to root-resolved versions) with `"type": "module"` and `"private": true`. Run `nx sync` to fix an out-of-sync manifest; add new un-bundleable packages to the generator's denylist. Consumer-side `ignoredDependencies` are still hand-maintained (see the generator's header for the deferred Phase 2).

**`libs/shared/feature/infisical`** — Infisical SDK integration for secrets management.

**`libs/shared/theme/`** — Theme configuration and providers.

### Path Aliases

TypeScript path aliases are defined in `tsconfig.base.json`:

- `@codeware/*` → internal libs, never published
- `@cdwr/*` → publishable packages, matching the npm scope
- `@payload-config` → `apps/cms/src/payload.config.ts`

Having two prefixes is deliberate, not legacy. The scope at an import site says whether you are reaching
for a published package or for workspace-internal source, which is exactly what the
published-dependency rule above rests on. Collapsing them onto `@cdwr` would read tidier and lose
that signal.

### Multi-Tenant Architecture

The platform is multi-tenant. Tenants are configured via Infisical secrets. The Nginx reverse proxy (`nx payload-proxy:up`) can optionally be used to simulate multi-tenancy in local development by routing hostnames to the appropriate apps.

In production, multi-tenancy is handled automatically by the `nx-pre-deploy-action` and `fly-deployment-action` GitHub Actions, which fetch tenant configs from Infisical and deploy accordingly.

#### Deployment switches

A deployment is switched on per environment by an Infisical secret `DEPLOY_ENABLED=true` in the app's own folder; anything else, or absent, is off. Release analysis decides _when_ an app deploys, the flags decide _where_.

| Folder                         | Switch on deploys                                          |
| ------------------------------ | ---------------------------------------------------------- |
| `/apps/<app>`                  | host app `cdwr-<app>`                                      |
| `/tenants/<tenant>/apps/<app>` | tenant app `cdwr-<app>-<tenant>` with `TENANT_ID=<tenant>` |

A host app reads `/apps/<app>` itself at boot, so the deploy pushes no folder secrets to it. The flag never reaches Fly. `cdwr infisical analysis` prints the matrix, and `cdwr tenant provision` sets a tenant's flags.

#### Tenancy & Authentication Model

##### Tenants

- The **Tenants collection is an AUTH collection**
- Each tenant acts as a **service user**
- Tenants authenticate using **API keys**

##### Users

- Editor users belong to **one or more tenants**
- Tenant membership controls access to headless content
- System admins do **not** need tenant membership by design

##### Scoping

- Tenant scoping is derived from the authenticated identity (`req.user`)
- All content access is scoped by `tenant.slug`
- External clients authenticate via `Authorization` header
- Payload treats valid tenant API keys as "logged in"

### Test Runners

- **Jest** — used for Node.js libraries and `apps/` server-side tests
- **Vitest** — used for React/browser libraries and pure utility libs
- Both are inferred automatically by Nx plugins; no manual target configuration needed

### CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs lint/test/build on PRs using Nx affected detection and Nx Cloud caching. Deployment selection is separate and **not** affected-based: the deployment workflow ships an app when `nx release` resolves a version bump for it from its conventional commits since the last release tag. A bump alone is not enough: the app also needs a runtime change in its range, meaning a changed file outside the ignore list (`ignoredFiles` in `nx-deploy`: Markdown, `.claude/**`, specs, stories, snapshots) that makes it affected. A preview's range is its own PR (`merge-base(origin/main, PR head)..PR head`), so unreleased commits on main and docs-only PRs deploy nothing. Production's range runs from the app's last release tag. Every dropped app is logged as `Skip: <app> - bumped by nx release, but no runtime change in <range>`. A manual dispatch naming an app skips both checks. Preview environments are created for each PR with temporary Postgres databases from a dedicated preview cluster.

### Release Process

Published packages use a hybrid `nx release` model (`nx.json` → `release.groups`): a **fixed** group for the Nx-plugin suite (`nx-payload` + `create-nx-payload`) and an **independent** group for `fly-node`. `cdwr release` (alias `nx release-cli`) is an interactive command in `tools/cdwr` that calls `nx release` — which bumps versions, generates changelogs, and tags releases. GitHub Actions then publish tagged packages to npm.

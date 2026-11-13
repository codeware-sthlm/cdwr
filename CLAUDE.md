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
- Pin a dependency family released in lockstep (Nx, Payload, Storybook, Vitest, Tailwind, Playwright, Jest) exact on every member; a caret on one member floats on the next lockfile refresh while the rest stay put. Independent packages keep a caret. The `dev-plugin:lockstep-versions-sync` sync generator enforces this on the root `package.json`; `nx sync` then `pnpm install` fixes a split
- Do not add CI integration unless explicitly asked
- Before making large structural changes, summarize the conventions found in the repo and the planned approach
- Git commits should follow conventional commit pattern in commitlint.config.cjs
- Commit messages should be short — single line preferred; no multi-paragraph explanations
- Never add `Co-Authored-By` trailers to commits
- Never push directly to main — always create a branch and open a PR

## Agent queue

Tickets with a Linear `agent:*` label are worked by `/work-queue` (`.claude/skills/work-queue`), which plans into the ticket and hands planned steps to the `implementer` subagent (Sonnet) in a worktree per ticket. Only Håkan sets `agent:ready`. Start an attended session with `cdwr agent attend [COD-n]`. How the scheduler, launches, telemetry, the desk and the GitHub and Linear apps work: [tools/cdwr/agent-queue/README.md](tools/cdwr/agent-queue/README.md). Read it before changing anything under `tools/cdwr/agent-queue`.

## Nx-generated projects cleanup

- ensure project name reflects the project path for a consistent and unique pattern
- remove auto-generated spec files that hasn't been evolved
- remove redundant project targets that is already inferred by plugins
- remove README.md when it doesn't contain valuable DX focused content

## Common Commands

```sh
pnpm cdwr                       # cdwr <group> <command> --help: db, fly, tenant, infisical, signature, media, agent, release
nx dx:postgres cms              # Postgres for the cms
nx dev cms                      # admin on localhost:3000/admin (auto-seeds)
nx reset-db cms                 # fresh database
nx seed cms
nx shadcn:add -- <component>
pnpm run c                      # conventional commit
cdwr release                    # interactive release
```

- Every `cdwr` command takes `-d/--dry-run`, `-y/--yes`, `-j/--json` and `-i/--interactive`. A command prompts for what is missing until one of its own inputs is given (global flags don't count), and destructive ones make you type the target's name on production. The contract is in [tools/cdwr/README.md](tools/cdwr/README.md). `media generate-images` is the only command that spends money (Replicate).
- After adding, removing or re-pathing a Payload admin component, run `nx payload cms generate:importmap` and commit the result. Otherwise the component silently fails to load in production.
- A new third-party origin must be added to the CSP (`@codeware/shared/util/csp` for the cms, `@codeware/app-headless/feature/security` for headless). Otherwise it breaks once `CSP_ENFORCE=true`.

Dev email, secrets, the builder service, Umami, host and tenant mode, and the seeded credentials are in [apps/cms/DEVELOPMENT.md](apps/cms/DEVELOPMENT.md).

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

**`apps/headless`** — a headless client for a tenant: TanStack Start on Nitro, deployed only as tenant apps (`cdwr-headless-<tenant>`), with no host app. `/apps/headless` holds what all tenants share, such as Sentry; each tenant's own settings are in `/tenants/<tenant>/apps/headless`. It replaces the retired Remix showcase `apps/web`.

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

**`libs/app-headless/`** — the headless client's code, so `apps/headless` keeps only routes and framework wiring:

- `data-access/` — signed cms requests, tenant config, site and document loading, sitemap entries; each takes a server context the app builds
- `feature/security` — the request pipeline: CSP, the site gate, debug headers
- `util/` — env schema, routing, SEO

No lib imports `@tanstack/react-start`: server functions, response statuses and request headers stay in the app.

**`libs/shared/ui/`** — React component library (shadcn/Radix UI based): cms-renderer, code highlighting, color-picker, copy-button, file-area, icon-picker, image, primitives, shadcn components, video.

**`libs/shared/util/`** — Utility libraries: `github` (GitHub Actions/API helpers), `misc` (node/process/CLI utils), `node`, `nx-deploy` (Nx affected-apps deploy analysis), `payload-api`, `payload-types`, `payload-utils`, `pure`, `release` (Nx release CLI), `schemas`, `seed`, `signature`, `tailwind`, `testing` (+ `/vitest` schema-test helpers), `typesafe`, `ui`, `zod`.

**Internal libs are not buildable.** They are bundled from source through `@codeware/*` aliases. A lib gets a private `package.json` only for an un-bundleable dependency. That file is generated by `dev-plugin:externalize-deps-sync` (fix it with `nx sync`) and must contain `"type": "module"`. Details: [ARCHITECTURE.md](ARCHITECTURE.md).

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

Tenants are configured in Infisical. Deploys are switched on per environment by `DEPLOY_ENABLED=true` ([ARCHITECTURE.md](ARCHITECTURE.md)).

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

CI/CD, preview deploys and the release model: [ARCHITECTURE.md](ARCHITECTURE.md).

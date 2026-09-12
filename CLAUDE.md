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
- Do not add CI integration unless explicitly asked
- Before making large structural changes, summarize the conventions found in the repo and the planned approach
- Git commits should follow conventional commit pattern in commitlint.config.cjs
- Commit messages should be short — single line preferred; no multi-paragraph explanations
- Never add `Co-Authored-By` trailers to commits
- Never push directly to main — always create a branch and open a PR

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

Point `apps/cms/.env.local` at it:

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

#### CMS admin components + import map

Payload resolves custom admin components (`admin.components.*` in `payload.config.ts`) through the
committed import map at `apps/cms/src/app/(payload)/admin/importMap.js`. Payload only regenerates it
in `dev` — the committed map is what the production build/runtime uses. So whenever you **add, remove,
or re-path an admin component**, regenerate and commit it, or the component silently fails to load:

```sh
nx payload cms generate:importmap
```

#### CMS Host mode + external web client

Ensure `TENANT_ID` has no value in `apps/cms/.env.local`.

```sh
# Terminal 1: Serve the Payload admin UI (auto-seeds on start)
nx dev cms

# Terminal 2: Serve web client
nx dev web
```

| View            | URL                    | Credentials                |
| --------------- | ---------------------- | -------------------------- |
| Tenant client   | `localhost:4200`       |                            |
| Tenant admin UI | `localhost:3000/admin` | `titan@local.dev` / `dev`  |
| CMS admin UI    | `localhost:3000/admin` | `system@local.dev` / `dev` |

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

### Interactive CLI Tools (database / Fly.io / Infisical / media)

```sh
pnpm cdwr
# Database: backup-db, restore-db, test-migration, sync-storage, drop-db
# Fly.io:   restart-app, app-info, patch-config
# Infisical: infisical-tenants, infisical-data, infisical-analysis, rotate-tenant-key, rotate-signature-secret
# Media:    generate-images
```

`generate-images` is the only tool here that **spends money** — it bills Replicate per
image. It writes to a gitignored `.showcase-images/` and never uploads: the gallery's
examples end up in Chromatic snapshots, so replacing one is a deliberate visual review.

### Release Packages

```sh
# Interactive release process (generates changelog, bumps versions, creates GitHub releases)
nx release-cli
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

**`apps/web`** — a technical showcase, not the default client. A Remix v2 + Hono app (Hono wraps Remix for a unified Node server) proving a second React framework can consume the headless API and render the same content through the shared `cms-renderer` components. Reach for `apps/cms` when serving a real tenant.

### Publishable Packages (`packages/`)

Only these four are published to npm:

| Package                   | Purpose                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `@cdwr/nx-payload`        | Nx plugin adding Payload CMS generators/executors to any Nx workspace |
| `@cdwr/create-nx-payload` | Preset to scaffold a new Nx workspace with Payload                    |
| `@cdwr/nx-ai`             | Nx plugin for AI-assisted workspace tasks                             |
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

GitHub Actions (`.github/workflows/ci.yml`) runs lint/test/build on PRs using Nx affected detection and Nx Cloud caching. Deployment selection is separate and **not** affected-based: the deployment workflow ships an app when `nx release` resolves a version bump for it from its conventional commits since the last release tag. Preview environments are created for each PR with temporary Postgres databases from a dedicated preview cluster.

### Release Process

Published packages use a hybrid `nx release` model (`nx.json` → `release.groups`): a **fixed** group for the Nx-plugin suite (`nx-payload` + `create-nx-payload`) and an **independent** group for `nx-ai` and `fly-node`. The `nx release-cli` target runs an interactive CLI (`libs/shared/util/release`) that calls `nx release` — which bumps versions, generates changelogs, and tags releases. GitHub Actions then publish tagged packages to npm.

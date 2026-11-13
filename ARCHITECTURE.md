# Architecture

Reference detail for the workspace that is too long for CLAUDE.md: command notes, the internal-lib build convention, tenancy and deployment switches, CI/CD and releases.

## Workspace commands

`media generate-images` is the only command that **spends money** — it bills Replicate per
image. It writes to a gitignored `.showcase-images/` and never uploads: the gallery's
examples end up in Chromatic snapshots, so replacing one is a deliberate visual review.

```sh
# Interactive release process (generates changelog, bumps versions, creates GitHub releases)
cdwr release        # or `nx release-cli`, an alias
```

## Internal-lib build convention

**Internal-lib build convention:** internal libs are **not buildable** — they have no `build` target and are consumed by bundling their _source_ via `@codeware/*` tsconfig path aliases (nothing consumes a lib's `dist`), so `enforceBuildableLibDependency` is disabled workspace-wide. A lib only needs a private `package.json` (no `publishConfig`, `private: true`) when it imports an **un-bundleable** dep — a native `.node` module or a package with unresolvable dynamic requires — so esbuild externalizes it in every consumer that bundles it. Today only `nx-deploy` (`@nx/devkit`) and `misc` (`node-pty`) need one; consumers list those in the `@nx/dependency-checks` `ignoredDependencies`.

> ⚠️ Any such private `package.json` **must include `"type": "module"`** (the repo is ESM). Without it, node treats that lib's files as CommonJS, and a `tsx`-run script that imports the lib's barrel fails with `does not provide an export named …` (this broke the `release-cli` target and `pnpm cdwr`). Files under a package.json inherit its module type, not the root's.
>
> These manifests are **generated and guarded** by the `dev-plugin:externalize-deps-sync` global sync generator (registered in `nx.json` → `sync.globalGenerators`, enforced in CI via `nx sync --check`). It scans each `libs/` project's source imports against a curated denylist of un-bundleable packages, and for any lib that **both** imports one **and** is reached by a bundling consumer (esbuild/webpack — `tsx`-only libs like `release` are skipped), it ensures a private `package.json` exists declaring those deps (pinned to root-resolved versions) with `"type": "module"` and `"private": true`. Run `nx sync` to fix an out-of-sync manifest; add new un-bundleable packages to the generator's denylist. Consumer-side `ignoredDependencies` are still hand-maintained (see the generator's header for the deferred Phase 2).

## Multi-Tenant Architecture

The platform is multi-tenant. Tenants are configured via Infisical secrets. The Nginx reverse proxy (`nx payload-proxy:up`) can optionally be used to simulate multi-tenancy in local development by routing hostnames to the appropriate apps.

In production, multi-tenancy is handled automatically by the `nx-pre-deploy-action` and `fly-deployment-action` GitHub Actions, which fetch tenant configs from Infisical and deploy accordingly.

### Deployment switches

A deployment is switched on per environment by an Infisical secret `DEPLOY_ENABLED=true` in the app's own folder; anything else, or absent, is off. Release analysis decides _when_ an app deploys, the flags decide _where_.

| Folder                         | Switch on deploys                                          |
| ------------------------------ | ---------------------------------------------------------- |
| `/apps/<app>`                  | host app `cdwr-<app>`                                      |
| `/tenants/<tenant>/apps/<app>` | tenant app `cdwr-<app>-<tenant>` with `TENANT_ID=<tenant>` |

A host app reads `/apps/<app>` itself at boot, so the deploy pushes no folder secrets to it. The flag never reaches Fly. `cdwr infisical analysis` prints the matrix, and `cdwr tenant provision` sets a tenant's flags.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs lint/test/build on PRs using Nx affected detection and Nx Cloud caching. Deployment selection is separate and **not** affected-based: the deployment workflow ships an app when `nx release` resolves a version bump for it from its conventional commits since the last release tag. A bump alone is not enough: the app also needs a runtime change in its range, meaning a changed file outside the ignore list (`ignoredFiles` in `nx-deploy`: Markdown, `.claude/**`, specs, stories, snapshots) that makes it affected. A preview's range is its own PR (`merge-base(origin/main, PR head)..PR head`), so unreleased commits on main and docs-only PRs deploy nothing. Production's range runs from the app's last release tag. Every dropped app is logged as `Skip: <app> - bumped by nx release, but no runtime change in <range>`. A manual dispatch naming an app skips both checks. Preview environments are created for a PR carrying the `preview-deploy` label, with temporary Postgres databases from a dedicated preview cluster. The label is an opt-in: nothing adds it when a PR opens, the agent queue adds it once a PR's Copilot round is settled, and adding it deploys at once. A manual dispatch for a PR number deploys without it, and closing a PR tears its preview down either way.

## Release Process

Published packages use a hybrid `nx release` model (`nx.json` → `release.groups`): a **fixed** group for the Nx-plugin suite (`nx-payload` + `create-nx-payload`) and an **independent** group for `fly-node`. `cdwr release` (alias `nx release-cli`) is an interactive command in `tools/cdwr` that calls `nx release` — which bumps versions, generates changelogs, and tags releases. GitHub Actions then publish tagged packages to npm.

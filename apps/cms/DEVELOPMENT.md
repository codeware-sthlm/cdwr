# CMS development

Running the cms locally: services, secrets, build and security notes, host and tenant modes, and database commands.

## CMS Development

Ensure Posgres cluster is running.

```sh
# Start Postgres container when needed
nx dx:postgres cms
```

### Dev email

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

### Dev secrets

The `dev`, `seed`, `reset-db` and `verify` targets run through the `dev-plugin:infisical-run`
executor, which reads the app's Infisical folder with your CLI session. Precedence: committed `.env` < vault < anything set on
purpose (target env, `.env.local`, the shell). `OFFLINE=1` uses `apps/<app>/.env.offline`
instead, refreshed with `nx dx:secrets <app>`; `CI` skips the vault. `cdwr infisical resolve`
shows where each key comes from, `cdwr infisical session` whether you are logged in.
headless's `dev` reads only the cms's `/apps/cms/signature`, so it signs as the cms verifies; its
offline copy is still its own `apps/headless/.env.offline` (`--app=headless`).

### Custom component builds

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

### Site statistics (Umami)

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

### CMS admin components + import map

Payload resolves custom admin components (`admin.components.*` in `payload.config.ts`) through the
committed import map at `apps/cms/src/app/(payload)/admin/importMap.js`. Payload only regenerates it
in `dev` — the committed map is what the production build/runtime uses. So whenever you **add, remove,
or re-path an admin component**, regenerate and commit it, or the component silently fails to load:

```sh
nx payload cms generate:importmap
```

### Content Security Policy

The cms sends one, built by `@codeware/shared/util/csp` in `apps/cms/src/proxy.ts`; `apps/headless` builds its own in `@codeware/app-headless/feature/security`, from its global request middleware. Framing, plugins, `base-uri` and form targets are always
enforced. The full policy — a per-request nonce with `'strict-dynamic'` for scripts — goes out
`Content-Security-Policy-Report-Only` until `CSP_ENFORCE=true`. A new third-party origin has to be
added there, or it breaks the site once enforcement is on.

Violations go to Sentry's security endpoint, derived from `SENTRY_DSN`. In Sentry they are
issues of type _CSP_; without a DSN, locally, they appear only in the browser console.

### CMS Host mode

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
lets the seeded `@local.dev` users skip it. A preview takes the same flag from Infisical
together with `SEED_PASSWORD`, the seeded users' password there, since a preview url is
public; the env schema refuses the flag in preview without it or with the seed off or
`once` (the seed writes that password over an older database's), and always in production.

### CMS Tenant mode

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

## Database Operations

```sh
# Reset database for a fresh start
nx reset-db cms

# Seed database
nx seed cms
```

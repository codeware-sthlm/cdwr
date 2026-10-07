<p align="center">
  <br />
  <img width="200" src="../../assets/cdwr-cloud.png" alt="codeware sthlm logo">
  <br />
  <br />
</p>

<h1 align='center'>Fly Node</h1>

<p align='center'>
  The Fly CLI node wrapper for programmatic deployments to <a href='https://fly.io'>Fly.io</a>.
  <br />
  <br />
  <a href='https://www.npmjs.com/package/@cdwr/fly-node'><img src='https://img.shields.io/npm/v/@cdwr/fly-node?label=npm%20version' alt='@cdwr/fly-node npm'></a>
  &nbsp;
  <a href='https://opensource.org/licenses/MIT'><img src='https://img.shields.io/badge/License-MIT-green.svg' alt='MIT'></a>
  <br />
  <br />
</p>

This library is a lightweight, fully typed Node wrapper for the Fly CLI tool for programmatic deployments to [Fly.io](https://fly.io).

It has only one dependency, [Zod](https://zod.dev/), for validating the responses from the Fly API.

It's built with a configuration-first approach, meaning that you provide a `fly.toml` file and an API token, and let the library handle the necessary boilerplate stuff.

> [!NOTE]
> The library aims to be unopinionated and follow the `flyctl` commands structure as much as possible.
>
> There are tons of CLI commands that could be supported, but since blueprint deployments are the primary use case, this is where the focus lies.
>
> For now the library is built for the needs at Codeware Sthlm, but it aims to be flexible and work for any Fly.io app.

## Contents <!-- omit in toc -->

- [Installation](#installation)
- [Usage](#usage)
  - [Authentication](#authentication)
  - [Create a Fly instance](#create-a-fly-instance)
    - [Verify that the Fly client is ready](#verify-that-the-fly-client-is-ready)
  - [Deploying apps \& machines](#deploying-apps--machines)
    - [Create an application](#create-an-application)
    - [Destroy an application](#destroy-an-application)
    - [Deploy an application](#deploy-an-application)
    - [Application status](#application-status)
    - [List applications](#list-applications)
    - [Manage machines](#manage-machines)
  - [Configuration \& scaling](#configuration--scaling)
    - [Add a custom domain](#add-a-custom-domain)
    - [Remove a custom domain](#remove-a-custom-domain)
    - [List certificates](#list-certificates)
    - [Save application configuration](#save-application-configuration)
    - [Show application configuration](#show-application-configuration)
    - [Add application secrets](#add-application-secrets)
    - [Remove application secrets](#remove-application-secrets)
    - [List secrets](#list-secrets)
- [Without the CLI: `FlyApi`](#without-the-cli-flyapi)
  - [Manage certificates](#manage-certificates)
  - [Restart machines](#restart-machines)

## Installation

```bash
npm install @cdwr/fly-node
```

### Fly CLI Requirements <!-- omit in toc -->

> [!IMPORTANT]
> This library requires the Fly CLI (`flyctl`) to be installed and accessible in your PATH.

**Version used in test**: see [`verified-version.json`](./verified-version.json) — the same file CI installs from, so the two cannot drift apart.

**Installation Instructions**:

- **macOS**: `brew install flyctl`
- **Linux/WSL**: `curl -L https://fly.io/install.sh | sh`
- **Windows**: `pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"`
- **Manual Installation**: See [official docs](https://github.com/superfly/flyctl?tab=readme-ov-file#installation)

**Verify Installation**:

```sh
flyctl version
```

## Usage

The library behaves just like the Fly CLI tool regarding all default values.

For any command you run, your local `flyctl` installation will be verified. If it's not present, the command will abort with exception.

> [!TIP]
> Instead of `flyctl` you can also use `fly` if preferred.

### Authentication

Supported authentication methods to Fly.io in order:

1. authenticate locally via `flyctl auth login`
2. provide a token when creating the Fly instance
3. set access token environment variable `FLY_ACCESS_TOKEN`
4. set API token environment variable `FLY_API_TOKEN`

> [!NOTE]
> See [Fly Docs about security tokens](https://fly.io/docs/security/tokens/) for more details.

**Flaky `--access-token` flag**

From version **0.3.210** the access token flag has a regression, reported in <https://github.com/superfly/flyctl/issues/4648>.

> [!IMPORTANT]
> To avoid pinning a previous version, this library no longer relies on the `--access-token` flag.
> When a token is provided to the Fly instance, the library will set `FLY_ACCESS_TOKEN` internally.
>
> This legitimate workaround might change depending on how the Fly team responds to the issue. The intention is to handle this internally without affecting the library api.

### Create a Fly instance

```ts
import { Fly } from '@cdwr/fly-node';

const fly = new Fly();

// Provide a Fly token
const fly = new Fly({ token: 'my-fly-token' });
```

> [!TIP]
> Built-in monorepo support!
>
> When you run `flyctl` in your terminal, it will look for a `fly.toml` file in your current working directory. If that's not the case, you have to provide the `app` or `config` option for any command to run.
>
> This is what you have in a monorepo setup, where you probably have the `fly.toml` configuration files in the applications folders.
>
> The library `Fly` class works the same way at its default configuration. However, you can also provide the `app` or `config` options when creating the instance to let the commands know where to run.
>
> So, to create an instance to `my-app`, you can do it like this:
>
> ```ts
> const fly = new Fly({ config: 'apps/my-app/fly.toml' });
> ```
>
> Any command run on this instance will then be executed on `my-app`.
>
> Similarly when you have an application named `your-app` on Fly.io, you can create an instance to it like this:
>
> ```ts
> const fly = new Fly({ app: 'your-app' });
> ```
>
> Any command run on this instance will instead be executed on `your-app`.
>
> One more thing. The commands supported by this library and have `app` or `config` flags, will override the instance application when provided. This gives you the default `flyctl` CLI behaviour but with improved flexibility depending on your repository structure.

**Options**

| Name              | Description                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `token`           | Fly access token, when none of `FLY_ACCESS_TOKEN` or `FLY_API_TOKEN` is provided.                                               |
| `app` or `config` | Name of the application or the path to the fly configuration file to run all commands on.                                       |
| `org`             | Target organisation for your created apps. Defaults to your personal organisation.                                              |
| `region`          | Target region for your deployed apps. Defaults to auto-detect the fastest location.                                             |
| `logger`          | Custom logger for the library. Defaults to using `console.log()` and `console.error()`. CLI tracing can be enabled when needed. |

#### Verify that the Fly client is ready

As described in the [installation](#installation) section, the library will verify that the Fly client is ready for any command you run.

However, you can also verify that the Fly client is ready manually, without running any commands.

```ts
const isReady = await fly.isReady(); // true or false

// Or use assertion mode
const isReady = await fly.isReady('assert'); // throws error if false
```

For both modes a message will be logged to console when the Fly client is ready.

Use this command to check if the Fly CLI is installed.

```ts
const isInstalled = await fly.cli.isInstalled(); // true or false
```

This command gets the installed Fly CLI version.

```ts
const { version } = await fly.cli.version();
```

### Deploying apps & machines

#### Create an application

This will create an application which is not deployed yet. You can add secrets, domains etc. and deploy later when ready.

> [!TIP]
> Creating an application is not necessary before deploying, the library will do it for you.

```ts
await fly.apps.create(); // name: 'some-app-name-123'

// Create application 'foo-app' in the instance organisation
await fly.apps.create({ app: 'foo-app' });

// Create application 'bar-app' in organisation 'baz'
await fly.apps.create({ app: 'bar-app', org: 'baz' });
```

#### Destroy an application

This will destroy the application completely.

> [!NOTE]
> When the application is attached to one or many Postgres clusters, it will be detached from all before it gets destroyed

```ts
await fly.apps.destroy('foo-app');
```

#### Deploy an application

> [!IMPORTANT]
> Currently there's a small limitation to detecting which configuration to use for deployment. To make sure the correct configuration is used you must provide the configuration file, either globally via instance or in the command options.
>
> Without providing the configuration file, the command will throw an error.

```ts
// deploy the instance application, if provided
const response = await fly.deploy();

// deploy 'foo-app'
const response = await fly.deploy({ config: 'apps/foo-app/fly.toml' });

// deploy 'bar-app' configuration as 'preview-bar-app'
const response = await fly.deploy({
  app: 'preview-bar-app',
  config: 'apps/bar-app/fly.toml'
});

// deploy 'bar-app' and attach postgres cluster 'db-app'
const response = await fly.deploy({
  config: 'apps/bar-app/fly.toml',
  postgres: 'db-app'
});

// Opt out of the default depot builder
const response = await fly.deploy({
  app: 'pr-19-foo-app',
  config: 'apps/foo-app/fly.toml',
  optOutDepotBuilder: true
});

// Use remote config for existing apps (useful to prevent overriding ad-hoc configurations)
const response = await fly.deploy({
  app: 'tenant-foo-app',
  config: 'apps/foo-app/fly.toml',
  preferRemoteConfig: true
});
// For existing apps: saves remote config to fly.{appName}.toml and uses it
// For new apps: uses the local config file

// Deploy with existing image (skips build, useful for config-only updates)
const response = await fly.deploy({
  app: 'foo-app',
  config: 'apps/foo-app/fly.toml',
  image: 'registry.fly.io/foo-app:deployment-01234567'
});
// Or use just the tag (will be expanded to full registry path)
const response = await fly.deploy({
  app: 'foo-app',
  config: 'apps/foo-app/fly.toml',
  image: 'deployment-01234567'
});

// With options that could be a pull request preview deployment
const response = await fly.deploy({
  app: 'pr-19-foo-app',
  config: 'apps/foo-app/fly.toml',
  environment: 'preview',
  org: 'baz',
  postgres: 'db-preview',
  region: 'arn',
  buildArgs: {
    NEXT_PUBLIC_DEPLOY_ENV: 'preview'
  },
  env: {
    DEPLOY_ID: 'qwerty'
  },
  secrets: {
    LICENCE_KEY: '1234567890'
  }
});

// {
//   app: 'pr-19-foo-app',
//   hostname: 'pr-19-foo-app.fly.dev',
//   url: 'https://pr-19-foo-app.fly.dev'
// }
```

> [!TIP]
> When the application is attached to a Postgres cluster, Fly will provide the secret `DATABASE_URL` to the application.
>
> Read more about [attach or detach a Fly app](https://fly.io/docs/postgres/managing/attach-detach/#attach-a-fly-app).

#### Application status

```ts
// Get the status of the instance application
const status = await fly.status();

// Get the status of 'foo-app'
const status = await fly.status({ app: 'foo-app' });
const status = await fly.status({ config: 'apps/foo-app/fly.toml' });

// {
//   name: 'foo-app',
//   hostname: 'foo-app.fly.dev',
//   url: 'https://foo-app.fly.dev',
//   organization: {
//     name: 'personal'
//   },
//   status: 'running',
//   ... more
// }

// Get the status of an application that doesn't exist
const status = await fly.status({ app: 'non-existent-app' }); // null

// There is also an extended status command with more details
const status = await fly.statusExtended();

// {
//   ... same as above
//   domains: [
//     'foo.domain.com'
//   ],
//   secrets: [
//     'FOO',
//     'BAR'
//   ],
//   ... more
// }
```

#### List applications

```ts
// Get all applications
const apps = await fly.apps.list();
```

#### Manage machines

Control individual machines within your applications.

```ts
// Start a machine
await fly.machines.start('foo-app', 'machine-id-123');

// Stop a machine
await fly.machines.stop('foo-app', 'machine-id-123');

// Restart a machine (stop, wait until stopped, start, wait until started)
await fly.machines.restart('foo-app', 'machine-id-123');
```

`restart` handles one machine: it waits until Fly reports it stopped (or suspended) before starting it, then until it is `started`. If the start fails after the stop, the error says the machine was left stopped.

### Configuration & scaling

#### Add a custom domain

Adding a domain will create a certificate for it with automatic renewal.

> [!TIP]
> Read the guide about how to [add a custom domain for your app](https://fly.io/docs/networking/custom-domain/#add-a-custom-domain-for-your-app).

```ts
// Add a Domain to the instance application
await fly.certs.add('foo.domain.com');

// Add a domain to 'bar-app'
await fly.certs.add('bar.domain.com', { app: 'bar-app' });
await fly.certs.add('baz.domain.com', { config: 'apps/bar-app/fly.toml' });
```

#### Remove a custom domain

```ts
// Remove a domain from the instance application
await fly.certs.remove('foo.domain.com');

// Remove a domain from 'bar-app'
await fly.certs.remove('bar.domain.com', { app: 'bar-app' });
await fly.certs.remove('baz.domain.com', { config: 'apps/bar-app/fly.toml' });
```

#### List certificates

```ts
// List certificates for the instance application
const certs = await fly.certs.list();

// List certificates for 'foo-app'
const certs = await fly.certs.list({ app: 'foo-app' });
const certs = await fly.certs.list({ config: 'apps/foo-app/fly.toml' });

// [
//   {
//     clientStatus: 'Ready',
//     createdAt: '2024-01-01T00:00:00.000Z',
//     hostname: 'foo.domain.com',
//   },
//   ...
// ]

// List certificates for all your applications
const certs = await fly.certs.list('all');

// [
//   {
//     app: 'foo-app',
//     [cert details]
//   },
//   ...
//   {
//     app: 'bar-app',
//     [cert details]
//   },
//   ...
// ]
```

#### Save application configuration

Save an application's remote configuration from Fly.io to a local TOML file. This is useful for backing up configurations or using remote configs for existing apps in deployments.

```ts
// Save 'foo-app' remote config to local file
await fly.config.save({
  app: 'foo-app',
  config: 'apps/foo-app/fly.remote.toml'
});
```

#### Show application configuration

The configuration is always fetched from Fly.io remote configuration, but you can also fetch the local configuration file.

When a configuration cannot be shown, the command will throw an error.

> [!TIP]
> Fetching local configuration is the only option for applications never deployed. It will also assure that the file exists.

```ts
// Show the instance application configuration
const config = await fly.config.show();

// Show 'foo-app' configuration
const config = await fly.config.show({ app: 'foo-app' });
const config = await fly.config.show({ config: 'apps/foo-app/fly.toml' });

// Show local 'new-app' configuration
const config = await fly.config.show({
  config: 'apps/new-app/fly.toml',
  local: true
});
```

#### Add application secrets

Adding secrets to an application will trigger a deployment for machines running the application.

```ts
// Add secrets to the instance application
await fly.secrets.set({
  LICENCE_KEY: '1234567890',
  SOME_SECRET: 'super-secret'
});

// Add secrets to 'foo-app'
await fly.secrets.set({ FOO: 'bar' }, { app: 'foo-app' });
await fly.secrets.set({ BEE: 'baz' }, { config: 'apps/foo-app/fly.toml' });

// Add secrets to 'foo-app' and skip auto-deploy
await fly.secrets.set({ FOO: 'bar' }, { app: 'foo-app', stage: true });
```

#### Remove application secrets

```ts
// Remove secret from the instance application
await fly.secrets.unset('FOO');

// Remove secret from 'foo-app'
await fly.secrets.unset('FOO', { app: 'foo-app' });
await fly.secrets.unset('BEE', { config: 'apps/foo-app/fly.toml' });

// Remove secret from 'foo-app' and skip auto-deploy
await fly.secrets.unset('FOO', { app: 'foo-app', stage: true });
```

#### List secrets

```ts
// List secrets for the instance application
const secrets = await fly.secrets.list();

// List secrets for 'foo-app'
const secrets = await fly.secrets.list({ app: 'foo-app' });
const secrets = await fly.secrets.list({ config: 'apps/foo-app/fly.toml' });
```

## Without the CLI: `FlyApi`

`Fly` drives the `flyctl` binary. That is the right tool in CI — it builds and
deploys, and a runner has the binary installed — but it cannot run inside an
application server: there is no binary in the image, and the interactive paths
need a pty.

`FlyApi` talks to Fly over its HTTP APIs instead. No binary, no subprocess,
usable from a running app. It is deliberately a small subset rather than a
second implementation of the CLI — certificates, because a custom domain has
to be requested, checked and shown to a customer while they wait, and machine
restarts, because a setting read at boot needs a boot to take effect.

It has its own entry point, `@cdwr/fly-node/api`. Import from there rather than
the root barrel when the CLI half cannot come along: the root barrel reaches a
native pty module, which a slim application image does not have.

Fly splits the two operations across two APIs and so does `FlyApi` —
certificates over GraphQL, machines over the REST Machines API. One token
authenticates both.

### Manage certificates

```ts
import { FlyApi } from '@cdwr/fly-node/api';

const fly = new FlyApi({ token: process.env.FLY_API_TOKEN });

// Request a certificate. Safe to call again — Fly returns the existing one.
const { certificate, check } = await fly.certs.add('my-app', 'tours.example.com');

if (!certificate.isConfigured) {
  // What the customer has to create, and what Fly resolves right now
  console.log(FlyApi.dnsInstructions(certificate));
  console.log(check?.dnsConfigured, check?.cnameRecords);
}

// Re-read issuance state — the call behind a "check" button
await fly.certs.get('my-app', 'tours.example.com');

await fly.certs.list('my-app');
await fly.certs.remove('my-app', 'tours.example.com');
```

Notes worth knowing:

- **Field names are Fly's own** (`isConfigured`, not `configured`), so results
  can be read against Fly's schema without translating. Where the CLI covers
  the same ground the shared fields agree.
- **Requesting before DNS exists is normal.** The certificate stays pending
  until the records resolve; the validation fields are what you show meanwhile.
- **`rateLimitedUntil`** is set when Let's Encrypt has throttled further
  attempts. It is the one failure correcting DNS will not fix, and retrying
  makes it worse.
- **`list` does not resolve DNS.** `check` is only returned by `add`, because
  resolving across every certificate on an app would turn one query into a
  lookup per domain.
- **A hostname with no certificate is not an error.** Fly reports it as a
  `NOT_FOUND` GraphQL error; `certs.get` translates that to `null`. Anything else
  rejects with a `FlyApiError` carrying the codes Fly sent.

### Restart machines

```ts
import { FlyApi } from '@cdwr/fly-node/api';

const fly = new FlyApi({ token: process.env.FLY_API_TOKEN });

await fly.machines.list('my-app');

// Restart every machine on the app, one at a time
await fly.machines.restart('my-app');

// Or just one
await fly.machines.restart('my-app', 'e286000a123456');
```

Notes worth knowing:

- **Restarts are sequential, not parallel.** A setting that only takes effect
  at boot should not cost the app its availability to apply — restarting
  together would drop every machine at once. The trade is that a large app
  takes longer.
- **A failed restart stops the run.** It does not skip ahead to the next
  machine: a half-restarted app is running two configurations at once, and
  silently returning "some of them" invites calling that done.
- **This is the REST Machines API, not GraphQL.** Fly's GraphQL machine
  mutations are Nomad-era and no longer apply, so this half of `FlyApi` has its
  own request helper with its own failure shape — a non-2xx status and an
  `error` field in the body, rather than GraphQL's 200-with-an-`errors`-array.

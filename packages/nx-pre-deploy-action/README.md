<p align="center">
  <br />
  <img width="200" src="../../assets/cdwr-cloud.png" alt="codeware sthlm logo">
  <br />
  <br />
</p>

<h1 align='center'>Nx Pre-deploy Action</h1>

<p align='center'>
  GitHub action that analyzes which applications to deploy, which environment to deploy to, and reads from Infisical where each one is switched on, with per-tenant secrets for multi-tenant deployments.
  <br />
  <br />
  &nbsp;
  <a href='../../LICENSING.md'><img src='https://img.shields.io/badge/License-FSL--1.1--MIT-green.svg' alt='FSL-1.1-MIT'></a>
  <br />
  <br />
</p>

## Description

This action performs pre-deployment analysis for applications in an Nx workspace.

1. Determines the deployment environment based on the GitHub event
2. Analyzes which Nx applications that should be deployed
3. Reads from Infisical which deployments are switched on for the environment (host app and tenants), with per-tenant secrets

This action is intended to be used before the [Fly Build Action](https://github.com/codeware-sthlm/cdwr/tree/main/packages/fly-build-action#readme) and [Fly Deployment Action](https://github.com/codeware-sthlm/cdwr/tree/main/packages/fly-deployment-action#readme).

## Features

### Environment Detection

Automatically determines whether to deploy to `preview` or `production` based on:

- Pull requests → `preview` environment
- Push to main branch → `production` environment
- Fallback to empty environment, which should indicate a deployment can't be performed

Returned in `environment` output.

### Release Analysis

Uses `nx release` to determine which applications have a version bump since their last release
tag, and resolves the version each one should be released as. Preview deployments resolve
within a per-PR lane (`preview.<pr-number>`).

A `manual-app` override bypasses the bump check and deploys that app at its last released
version.

Returned in `apps` output.

### Deployment Discovery

Release analysis decides _when_ an app is deployed, Infisical decides _where_. Each deployment is
switched on per environment by a `DEPLOY_ENABLED` secret in its own folder:

| Deployment                                        | Switch, per environment                 |
| ------------------------------------------------- | --------------------------------------- |
| Host app `X` (`cdwr-X`, no `TENANT_ID`)           | `/apps/X/DEPLOY_ENABLED=true`           |
| Tenant `t` of app `X` (`cdwr-X-t`, `TENANT_ID=t`) | `/tenants/t/apps/X/DEPLOY_ENABLED=true` |

- Only `true` (trimmed, case-insensitive) deploys. Absent or anything else is off, which keeps a new environment safe by default.
- Pausing a deployment is an edit of the flag. The other secrets stay.
- The flag is stripped before secrets reach Fly.
- A host entry carries no folder secrets, the app reads `/apps/X` at boot. Tenant entries carry the folder's variables and secrets.
- Classifies tenant secrets as **environment variables** (public, visible) or **secrets** (encrypted, hidden) using Infisical secret metadata:  
  → set `env` key to `true` for public secrets
- An app with no deployment switched on is left out of `apps`, with the reason logged. A tenant-only app never deploys as a bare host.
- Empty folders without the flag are inert and silent, a folder with secrets but no or false flag is logged.
- `manual-tenant` and `manual-app` narrow the result, they never bypass a flag.

Infisical credentials are required whenever there is something to deploy; without them the action fails.

Returned in `apps` and `app-tenants` outputs.

## Usage

### Basic Usage

```yaml
jobs:
  pre-deploy:
    runs-on: ubuntu-latest

    outputs:
      apps: ${{ steps.pre-deploy.outputs.apps }}
      environment: ${{ steps.pre-deploy.outputs.environment }}

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build pre-deploy action
        run: pnpm nx build nx-pre-deploy-action

      - name: Run pre-deploy
        id: pre-deploy
        uses: ./packages/nx-pre-deploy-action
        with:
          infisical-client-id: ${{ secrets.CLIENT_ID }}
          infisical-client-secret: ${{ secrets.CLIENT_SECRET }}
          infisical-project-id: ${{ secrets.PROJECT_ID }}

  fly-deployment:
    if: ${{ needs.pre-deploy.outputs.environment != '' }}
    needs: pre-deploy
    runs-on: ubuntu-latest
    environment: ${{ needs.pre-deploy.outputs.environment }}

    steps:
      # ... deployment steps
```

### Multi-tenant Usage

```yaml
jobs:
  pre-deploy:
    runs-on: ubuntu-latest

    outputs:
      environment: ${{ steps.pre-deploy.outputs.environment }}
      app-tenants: ${{ steps.pre-deploy.outputs.app-tenants }}

    steps:
      # ... install steps

      - name: Run pre-deploy
        id: pre-deploy
        uses: ./packages/nx-pre-deploy-action
        with:
          infisical-client-id: ${{ secrets.CLIENT_ID }}
          infisical-client-secret: ${{ secrets.CLIENT_SECRET }}
          infisical-project-id: ${{ secrets.PROJECT_ID }}

  fly-deployment:
    if: ${{ needs.pre-deploy.outputs.environment != '' }}
    needs: pre-deploy
    runs-on: ubuntu-latest
    environment: ${{ needs.pre-deploy.outputs.environment }}

    steps:
      # app-tenants is compatible with app-details,
      # but with a stricter type
      - name: Deploy
        uses: ./packages/fly-deployment-action
        with:
          apps: ${{ needs.pre-deploy.outputs.apps }}
          app-details: ${{ needs.pre-deploy.outputs.app-tenants }}
          # ... other inputs
```

## Inputs

| Input                     | Description                          | Required | Default                   |
| ------------------------- | ------------------------------------ | -------- | ------------------------- |
| `main-branch`             | The main branch name                 | No       | Repository default branch |
| `token`                   | GitHub token for authentication      | No       | `GITHUB_TOKEN`            |
| `infisical-client-id`     | Infisical machine client ID          | Yes\*    | -                         |
| `infisical-client-secret` | Infisical machine client secret      | Yes\*    | -                         |
| `infisical-project-id`    | Infisical project ID                 | Yes\*    | -                         |
| `infisical-site`          | Infisical site to use (`eu` or `us`) | No       | `eu`                      |
| `pr-number`               | Preview release lane to version in   | No       | - (production)            |

\*Required when there is an environment and apps to deploy.

## Outputs

| Output        | Description                                                                                                                                                                    | Example                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `apps`        | List of applications to deploy, only those with a deployment switched on                                                                                                       | `api,cms,web`                                                                                                              |
| `environment` | Deployment environment that match the GitHub event, if any.                                                                                                                    | `preview`, `production` or empty string                                                                                    |
| `app-tenants` | JSON object mapping each app to its deployments. A host deployment is an empty object `{}` and comes first, a tenant deployment has `tenant` and optional `env` and `secrets`. | See example below where `api` is host only, `cms` has one tenant without secrets and `web` host plus a tenant with secrets |

```json
// apps:
"api,cms,web"

// app-tenants:
{
  "api": [{}],
  "cms": [{ "tenant": "acme" }],
  "web": [
    {},
    {
      "tenant": "acme",
      "env": { "PUBLIC_URL": "..." },
      "secrets": { "API_KEY": "..." }
    }
  ]
}
```

## Environment Variables

The action sets environment variables that can be used in subsequent workflow steps:

- `DEPLOY_ENV`: Same as the `environment` output

## Multi-tenant Setup

### 1. Infisical Folder Structure

Store secrets in Infisical using this structure:

```json
// host app, read by the app itself at boot
/apps/<app-name>/<SECRET_NAME>

// app deployed for a tenant, with app-specific secrets
/tenants/<tenant-id>/apps/<app-name>/<SECRET_NAME>
```

**Example:**

- Applications: `api`, `web`
- Tenants: `acme`, `globex`

`api` deploys as a host app only. `web` deploys as a host app and for both tenants in production, but only for `acme` in preview.

```json
// production
/apps/api/DEPLOY_ENABLED = "true"
/apps/api/PUBLIC_URL = "https://api.example.com"
/apps/web/DEPLOY_ENABLED = "true"
/apps/web/PUBLIC_URL = "https://web.example.com"

/tenants/acme/apps/web/DEPLOY_ENABLED = "true"
/tenants/acme/apps/web/PUBLIC_URL = "https://acme.example.com"
/tenants/acme/apps/web/API_KEY = "sk_acme*"
/tenants/globex/apps/web/DEPLOY_ENABLED = "true"
/tenants/globex/apps/web/PUBLIC_URL = "https://globex.example.com"
/tenants/globex/apps/web/API_KEY = "sk_globex*"

// preview: only the acme tenant of web has the flag, so web never
// deploys as a bare host app there
/tenants/acme/apps/web/DEPLOY_ENABLED = "true"
```

### 2. Classify Secrets vs Environment Variables

Use Infisical's **secret metadata** to control whether values are treated as environment variables (visible) or secrets (encrypted):

- **Environment Variable** (public, visible): Set metadata key `env` to `true`
- **Secret** (encrypted, hidden): Don't set the metadata, or set `env` to something else

**Secure by default:** Everything is treated as a secret unless explicitly marked as an environment variable.

### 3. Switch deployments on

Add `DEPLOY_ENABLED = true` to the folder of each deployment, per environment. See [Deployment Discovery](#deployment-discovery).

This way it's possible to have full multi-tenant deployments in production, but only a subset of apps and tenants in preview.

> [!TIP]
> To pause a deployment, set the flag to `false` instead of deleting the folder.

### 4. Provide Infisical Credentials

Add Infisical client ID, client secret and project ID as GitHub secrets. Use them for corresponding action inputs.

<p align="center">
  <br />
  <img width="200" src="../../assets/cdwr-cloud.png" alt="codeware sthlm logo">
  <br />
  <br />
</p>

<h1 align='center'>Nx Pre-deploy Action</h1>

<p align='center'>
  GitHub action that analyzes which applications to deploy, which environment to deploy to, and optionally fetches tenant secrets from Infisical for multi-tenant deployments.
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
3. Optionally fetches app-tenant relations and secrets from Infisical for multi-tenant deployments

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

### Multi-tenant Support

Optionally fetches tenant secrets from Infisical to enable multi-tenant deployments with per-tenant environment variables and secrets:

- Reads `DEPLOY_RULES` secret to determine which apps and tenants are allowed to be deployed for each environment
- Discovers tenant-app relationships from Infisical folder structure:  
  → `/tenants/<tenant-id>/apps/<app-name>/`
- Classifies secrets as **environment variables** (public, visible) or **secrets** (encrypted, hidden) using Infisical secret metadata:  
  → set `env` key to `true` for public secrets
- Each application is deployed once per tenant with isolated configuration when available

Returned in `app-tenant` output.

## Usage

### Basic Usage (without tenants)

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

  fly-deployment:
    if: ${{ needs.pre-deploy.outputs.environment != '' }}
    needs: pre-deploy
    runs-on: ubuntu-latest
    environment: ${{ needs.pre-deploy.outputs.environment }}

    steps:
      # ... deployment steps
```

### Multi-tenant Usage (with Infisical)

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
| `infisical-client-id`     | Infisical machine client ID          | No       | -                         |
| `infisical-client-secret` | Infisical machine client secret      | No       | -                         |
| `infisical-project-id`    | Infisical project ID                 | No       | -                         |
| `infisical-site`          | Infisical site to use (`eu` or `us`) | No       | `eu`                      |
| `pr-number`               | Preview release lane to version in   | No       | - (production)            |

## Outputs

| Output        | Description                                                                                                                                                            | Example                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `apps`        | List of applications to deploy                                                                                                                                         | `api,cms,web`                                                                                                                |
| `environment` | Deployment environment that match the GitHub event, if any.                                                                                                            | `preview`, `production` or empty string                                                                                      |
| `app-tenants` | JSON object mapping multi-tenant apps to their tenants deployment details. Each app maps to an array with `tenant`, `env`, and `secrets` for per-tenant configuration. | See example below where `api` has no tenancy, `cms` has one tenant without secrets and `web` both exposed and hidden secrets |

```json
// apps:
"api,cms,web"

// app-tenants:
{
  // 'api' left out
  "cms": [{ "tenant": "acme" }],
  "web": [
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

To enable multi-tenant deployments with per-tenant configuration:

### 1. Infisical Folder Structure

Store secrets in Infisical using this structure:

```json
// applications with their secrets
/apps/<app-name>/<SECRET_NAME>

// tenants with their secrets !! MUST TEST THIS !!
/tenants/<tenant-id>/<SECRET_NAME>

// applications to deploy for each tenant with
// app-specific secrets
/tenants/<tenant-id>/apps/<app-name>/<SECRET_NAME>
```

**Example:**

- Applications: `api`, `web`
- Tenants: `acme`, `globex`

`web` is a multi-tenant application deployed for both tenants.

```json
/apps/api/PUBLIC_URL = "https://api.example.com"
/apps/web/PUBLIC_URL = "https://web.example.com"

/tenants/acme/apps/web/PUBLIC_URL = "https://acme.example.com"
/tenants/acme/apps/web/API_KEY = "sk_acme*"
/tenants/globex/apps/web/PUBLIC_URL = "https://globex.example.com"
/tenants/globex/apps/web/API_KEY = "sk_globex*"
```

**Hybrid Deployment (Single + Multi-tenant):**

Some apps may need to be deployed both as a tenant-scoped instance AND as a headless/default instance. Use the reserved tenant name `_default` for this:

```json
/apps/cms/DATABASE_URL = "postgres://..."
/apps/cms/PAYLOAD_SECRET_KEY = "..."

// Headless CMS deployment (no TENANT_ID set)
/tenants/_default/apps/cms/
// Optional: deployment-specific secrets for headless mode

// Multi-tenant deployments (TENANT_ID will be set)
/tenants/demo/apps/cms/
  PAYLOAD_API_KEY = "..."
  PAYLOAD_API_HOST = "demo.example.com"
/tenants/acme/apps/cms/
  PAYLOAD_API_KEY = "..."
  PAYLOAD_API_HOST = "acme.example.com"
```

The `_default` tenant is treated like any other tenant (respects DEPLOY_RULES), but the deployed app will NOT receive a `TENANT_ID` environment variable, allowing it to run in headless/default mode.

### 2. Classify Secrets vs Environment Variables

Use Infisical's **secret metadata** to control whether values are treated as environment variables (visible) or secrets (encrypted):

- **Environment Variable** (public, visible): Set metadata key `env` to `true`
- **Secret** (encrypted, hidden): Don't set the metadata, or set `env` to something else

**Secure by default:** Everything is treated as a secret unless explicitly marked as an environment variable.

### 3. Deploy rules

Create `DEPLOY_RULES` secret in the root path and add rules for each environment.

This way it's possible to have full multi-tenant deployments in production, but only a subset of apps and tenants in preview.

Rules can be specified in two ways:

#### Option 1: Metadata (preferred)

Add rules as secret metadata with `apps` and `tenants` keys. Infisical UI has native support for metadata, but it's only visible from secret details.

#### Option 2: JSON secret value (fallback)

Add rules as secret value in JSON format:

```json
{
  apps: string;
  tenants: string;
}
```

Example: `{ "apps": "*", "tenants": "*" }`

Use this when you rather want to see the rules in the secrets list.

> [!IMPORTANT]
> Either way, the rules must be valid otherwise an error is thrown

Rules format examples:

```yml
apps: '*' # all apps
apps: 'web,cms' # only web and cms apps
tenants: '*' # all discovered tenants
tenants: 'demo' # only demo tenant
tenants: 'demo,acme' # only demo and acme tenants
tenants: '_default,demo' # headless deployment + demo tenant
```

> [!TIP]
> The reserved tenant `_default` must be explicitly included in `tenants` rules if you want it deployed. It's useful for preview environments where you might only want the headless CMS + one test tenant:

### 4. Provide Infisical Credentials

Add Infisical client ID, client secret and project ID as GitHub secrets. Use them for corresponding action inputs.

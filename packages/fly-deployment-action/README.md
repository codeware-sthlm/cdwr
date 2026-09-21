<p align="center">
  <br />
  <img width="200" src="../../assets/cdwr-cloud.png" alt="codeware sthlm logo">
  <br />
  <br />
</p>

<h1 align='center'>Fly Deployment Action</h1>

<p align='center'>
  GitHub action that brings automatic <a href='https://fly.io'>Fly.io</a> deployments to your <a href='https://nx.dev'>Nx</a>  workspace.
  <br />
  <br />
  &nbsp;
  <a href='../../LICENSING.md'><img src='https://img.shields.io/badge/License-FSL--1.1--MIT-green.svg' alt='FSL-1.1-MIT'></a>
  <br />
  <br />
</p>

## Description

This action will manage deployments to [Fly.io](https://fly.io) of your [Nx](https://nx.dev) workspace applications.

Fits perfectly with [Nx Pre-deploy Action](https://github.com/codeware-sthlm/cdwr/tree/main/packages/nx-pre-deploy-action#readme) for multi-tenant setups.

## Required Application Setup

Each deployable app requires:

1. **`github.json`** - Deployment configuration in app root (optional postgres settings)
2. **Fly.io configuration** - One of the following:
   - `fly.{environment}.toml` (e.g., `fly.production.toml`, `fly.preview.toml`)
   - `fly.toml` (default)
   - For existing apps: remote configuration will be automatically fetched and used

### Fly Configuration Selection Logic

During deployment, the action uses this priority order:

1. **Existing apps**: Saves and uses remote configuration from Fly.io
2. **New apps**: Looks for environment-specific config (e.g., `fly.production.toml`)
3. **New apps**: Falls back to `fly.toml`
4. **No config found**: Deployment is skipped

> [!TIP]
> To disable deployment for an app, remove or rename its Fly configuration file (e.g., rename to `fly.local.toml` for manual deployments).

Applications without a `github.json` file will be skipped during deployment.

## Usage

This action is designed to run after the [fly-build-action](https://github.com/codeware-sthlm/cdwr/tree/main/packages/fly-build-action#readme) and the [nx-pre-deploy-action](https://github.com/codeware-sthlm/cdwr/tree/main/packages/nx-pre-deploy-action#readme). The `apps` and `environment` inputs are typically the outputs from `nx-pre-deploy-action`, and `images` from `fly-build-action`.

```yaml
deploy:
  needs: [pre-deploy, build]
  runs-on: ubuntu-latest

  steps:
    - uses: actions/checkout@v4

    # Install dependencies, build the action...

    - name: Install Fly CLI
      uses: superfly/flyctl-actions/setup-flyctl@master

    - name: Deploy to Fly
      uses: ./packages/fly-deployment-action
      with:
        fly-api-token: ${{ secrets.FLY_API_TOKEN }}
        token: ${{ secrets.GITHUB_TOKEN }}
        apps: ${{ needs.pre-deploy.outputs.apps }}
        environment: ${{ needs.pre-deploy.outputs.environment }}
        app-details: ${{ needs.pre-deploy.outputs.app-tenants }}
        images: ${{ needs.build.outputs.images }}
```

### Environment Determination

Environment is determined by the GitHub event (or overridden via the `environment` input):

- Pull requests → `preview`
- Push to main → `production`

Environment variables provided to deployed apps: `DEPLOY_ENV`, `APP_NAME`, `PR_NUMBER`, `TENANT_ID`

> [!NOTE] Environment detection logic and affected apps analysis
>
> **See:** [Nx Pre-deploy Action](https://github.com/codeware-sthlm/cdwr/tree/main/packages/nx-pre-deploy-action#features)

## Inputs

See [action.yaml](action.yml) for descriptions of the inputs.

### Additional input details

#### `app-details`

Provide a JSON object that maps app names to their deployment configurations. This supports both multi-tenant deployments and multi-deployment scenarios (e.g., multiple environments). This is typically the output from the [Nx Pre-deploy Action](https://github.com/codeware-sthlm/cdwr/tree/main/packages/nx-pre-deploy-action#readme).

> [!NOTE] Setting up multi-tenant configuration in Infisical
> **See:** [Multi-tenant Setup Guide](https://github.com/codeware-sthlm/cdwr/tree/main/packages/nx-pre-deploy-action#multi-tenant-setup)

**Structure:**

```json
{
  "web": [
    {
      "tenant": "acme",
      "env": { "PUBLIC_URL": "https://acme.example.com" },
      "secrets": { "API_KEY": "sk_acme_..." }
    },
    {
      "tenant": "globex",
      "env": { "PUBLIC_URL": "https://globex.example.com" },
      "secrets": { "API_KEY": "sk_globex_..." }
    }
  ],
  "cms": [{ "tenant": "acme" }]
}
```

**Behavior:**

- Each app is deployed once per deployment configuration
- Apps get unique names: `<base-app-name>-<tenant-id>` (e.g., `cdwr-web-acme`, `cdwr-web-globex`)
- The `TENANT_ID` environment variable is set for each deployment
- **Config merging**: Global `env`/`secrets` are merged with deployment-specific config (deployment wins)
- If no `app-tenants` provided, apps deploy once with only global config

**Example usage:**

```yaml
- name: Deploy
  uses: ./packages/fly-deployment-action
  with:
    app-details: ${{ needs.pre-deploy.outputs.app-tenants }}
    env: |
      GLOBAL_VAR=shared-value
    secrets: |
      SHARED_SECRET=xyz
```

In this example, `GLOBAL_VAR` and `SHARED_SECRET` are available to all deployments, but deployment-specific values take precedence if they have the same key.

**Note:** The `tenant` field is optional. You can provide `env`/`secrets` without a tenant for multi-deployment scenarios (e.g., different configurations for staging/production).

#### `secrets`

Global secrets passed to all deployed applications as Fly secrets. These are merged with deployment-specific secrets from `app-details` (deployment-specific takes precedence).

Provide the secrets as multiline key/value strings.

```yaml
- uses: ./packages/fly-deployment-action
  with:
    secrets: |
      SECRET_KEY1=secret-value1
      SECRET_KEY2=secret-value2
```

> [!NOTE]
> The same pattern applies to the `env` input.

### Outputs

See [action.yaml](action.yml) for descriptions of the outputs.

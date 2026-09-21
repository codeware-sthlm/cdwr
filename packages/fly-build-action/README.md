<p align="center">
  <br />
  <img width="200" src="../../assets/cdwr-cloud.png" alt="codeware sthlm logo">
  <br />
  <br />
</p>

<h1 align='center'>Fly Build Action</h1>

<p align='center'>
  GitHub action that builds Docker images for Nx applications and pushes them to the Fly registry.
  <br />
  <br />
  &nbsp;
  <a href='../../LICENSING.md'><img src='https://img.shields.io/badge/License-FSL--1.1--MIT-green.svg' alt='FSL-1.1-MIT'></a>
  <br />
  <br />
</p>

## Description

Builds Docker images for the specified Nx applications and pushes them to the Fly registry without deploying. The resulting image references are passed to the [Fly Deployment Action](https://github.com/codeware-sthlm/cdwr/tree/main/packages/fly-deployment-action#readme) to skip rebuilding during deployment.

Separating build from deploy enables inserting steps in between — for example creating a Sentry release or running smoke tests against the built image.

## Required Application Setup

Each buildable app requires a Dockerfile and one of:

- `fly.{environment}.toml` (e.g., `fly.production.toml`, `fly.preview.toml`)
- `fly.toml` (default)

## Usage

This action is designed to run after the [nx-pre-deploy-action](https://github.com/codeware-sthlm/cdwr/tree/main/packages/nx-pre-deploy-action#readme). The `apps` and `environment` inputs are typically the outputs from `nx-pre-deploy-action`.

```yaml
build:
  needs: pre-deploy
  runs-on: ubuntu-latest

  outputs:
    images: ${{ steps.build.outputs.images }}

  steps:
    - uses: actions/checkout@v4

    # Install dependencies, build the action...

    - name: Install Fly CLI
      uses: superfly/flyctl-actions/setup-flyctl@master

    - name: Build Docker images
      id: build
      uses: ./packages/fly-build-action
      with:
        fly-api-token: ${{ secrets.FLY_API_TOKEN }}
        token: ${{ secrets.GITHUB_TOKEN }}
        apps: ${{ needs.pre-deploy.outputs.apps }}
        environment: ${{ needs.pre-deploy.outputs.environment }}
        app-details: ${{ needs.pre-deploy.outputs.app-tenants }}
```

### Build Arguments

Use `build-args` to pass values that need to be embedded in the Docker image at build time (e.g., `NEXT_PUBLIC_*` variables, source map upload tokens).

> [!IMPORTANT]
> Declare each build arg in your Dockerfile with `ARG` (not `ENV`) to avoid persisting sensitive values in the final image.

```yaml
- uses: ./packages/fly-build-action
  with:
    build-args: |
      NEXT_PUBLIC_API_URL=https://api.example.com
      SENTRY_AUTH_TOKEN=${{ secrets.SENTRY_AUTH_TOKEN }}
```

## Inputs

See [action.yml](action.yml) for descriptions of all inputs.

## Outputs

| Output        | Description                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `environment` | The environment used for the build (`preview` or `production`).                                                            |
| `images`      | JSON object mapping project names to pushed image references. Pass this to `fly-deployment-action` via the `images` input. |

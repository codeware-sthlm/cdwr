<p align="center">
  <br />
  <img width="200" src="../../assets/cdwr-cloud.png" alt="codeware sthlm logo">
  <br />
  <br />
</p>

<h1 align='center'>Nx Migrate</h1>

<p align='center'>
  GitHub action that brings automatic <a href='https://nx.dev'>Nx</a> migrations to your workspace.
  <br />
  <br />
  &nbsp;
  <a href='../../LICENSING.md'><img src='https://img.shields.io/badge/License-FSL--1.1--MIT-green.svg' alt='FSL-1.1-MIT'></a>
  <br />
  <br />
</p>

## Description

This action assures your Nx workspace stays up to date.

When the action runs it will check you local Nx version to see whether there's a new version available.
In that case a migration process is triggered and the changes are tested by your test setup.

A pull request is always created for a new version, which can by auto-merged when all tests have passed.

> As long as the repository is setup to allow auto-merges

An open pull request for a specific Nx version is considered pending and will block a new pull request from being created for the same version. This is to give a developer some time to fix any breaking changes or to review in case auto-merge is disabled.

On the other hand, when a new Nx version is released the action will automatically close any pending pull requests and create a new one. The pending pull request branches will be deleted.

### Prompt migrations

Nx 23 introduced prompt migrations, which are applied by an AI agent instead of a generator. The agentic flow is interactive-only, so it never runs in CI. The action detects these migrations, lists them in the pull request body and keeps auto-merge disabled until they have been applied manually.

Their prompt files are written to `tools/ai-migrations/` and committed to the pull request branch, so applying them is a matter of checking out the branch and running the prompts in the listed order.

The action does not pass `--agentic` in any form, which leaves `nx.json` as the single owner of the agentic choice:

```jsonc
{
  "migrate": {
    "agentic": true // or an agent id: "claude-code", "codex", "opencode"
  }
}
```

> Note that `migrate.agentic` also enables per-migration commits by default when the agentic flow actually runs.

## Usage

Using the action is currently limited to this repository since the package isn't deployed.

```yaml
- uses: actions/checkout@v4

# Install dependencies and tools...
# Build 'nx-migrate-action' package...

- name: Run Nx migrate
  uses: ./packages/nx-migrate-action
  with:
    token: ${{ secrets.BOT_TOKEN || secrets.GITHUB_TOKEN }}
```

### Permissions

#### Pull requests

GitHub Actions must be allowed to create pull requests.  
This feature should be enabled for the repository in **Settings** -> **General** -> **Workflow permissions**.

#### Token

A token is a required input to the action, which needs to be able to both read and write to the repository, as well as manage pull requests.

##### Option 1

Use the default `GITHUB_TOKEN` and elevate the permissions in the workflow.

```yml
permissions:
  contents: write
  pull-requests: write
```

> [!IMPORTANT]
>
> If the pull requests created with this action have **status checks** triggered via `push` or `pull_request` events, then you cannot use the default `GITHUB_TOKEN`.
>
> This by design to prevent you from accidentally creating recursive workflow runs.
>
> Two workarounds to this limitation.
>
> - Create a [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) (PAT) as described in [Option 2](#option-2) below.
> - Register a [GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app) to authenticate which also is more secure than a PAT.  
>   Read more about how to register in [GitHub App Settings](#github-app-settings).

##### Option 2

Generate a [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) (PAT).

- Classic PAT should have `repo` and `workflow` scopes
- Fine-grained PAT should have `Contents`, `Pull requests` and `Workflows` set to `Read and write`

Add the token to the repository secrets in **Settings** -> **Secrets and variables** -> **Actions**.

## Inputs

See [action.yaml](action.yml) for descriptions of the inputs.

### Additional input details

`auto-merge`

It will always be `false` when auto merge isn't enabled in the repository settings.

For major version updates this option is ignored. When it's set to `true` a comment will be added to the pull request explaining why auto-merge is disabled.

Also when any of tests or e2e is enabled and fail, auto merge will be disabled. A comment will reflect this in the pull request.

`check-token`

It's not recommended to use this in production since it might block the workflow from running.

`committer`

Commits can be signed automatically when `token` is generated from your own GitHub App.
You also need to provide the same GitHub App details as the committer.

```yml
your-app[bot] <{APP_ID}+your-bot[bot]@users.noreply.github.com>
```

Read more about [GitHub commit signature verification](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification).

`skipTests` & `skipE2e`

> [!TIP]
> When status checks have been setup which will affect the created pull request, there's no need to run any tests within the action.
>
> Set `skipTests` and/or `skipE2e` to `true` depending on the nature of the checks.

When base tests are not skipped, the action will run this command

```sh
nx run-many -t lint,test,build -c ci
```

When e2e is not skipped and previous tests did not fail, the action will run this command

```sh
nx run-many -t e2e -c ci
```

> [!NOTE]
> When any of the commands fail, auto merge will be disabled, in case `auto-merge` was set to `true`

## Development

### Running locally with `act`

GitHub actions can be run locally using [act](https://github.com/nektos/act).

By providing a proper PAT the action will be able to run just like it does in the GitHub Actions runner.

Getting started instructions can be found in [.github/workflows/README.md](.github/workflows/README.md).

#### After `act` has been installed

Verify that the secrets and variables have the desired values:

- `.env.act`
- `.secrets`
- `.vars`

Run the action:

```sh
nx act nx-migrate-action
```

## Miscellaneous

### GitHub App Settings

1. Follow the instructions in [Register a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app) and apply the settings below:
   - Webhook is not needed, so uncheck `Active`under `Webhook`
   - Select under `Repository permissions`
     - `Contents` with `Write & Read` access
     - `Pull requests` with `Write & Read` access
     - `Workflows` with `Write & Read` access
   - Select under `Organization permissions`
     - `Members` with `Read` access  
       **Note!** Optional to also be able to use teams in inputs

2. When the app is created, generate a private key and store it securely together with the generated PEM file.

3. Install the app to the repositories you want to run the action in.

4. Create secrets and select which repositories to expose them to.
   - `APP_ID`: The GitHub App ID
   - `APP_PRIVATE_KEY`: The private key

   _Secret names could be anything you like._

5. Your workflow must be complemented with a new action which will generate a token in run-time.

```yml
- uses: actions/create-github-app-token@v1
  id: generate-token
  with:
    app-id: ${{ secrets.APP_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}

- uses: actions/checkout@v4

# Install dependencies and tools...
# Build 'nx-migrate-action' package...

- name: Run Nx migrate
  uses: ./packages/nx-migrate-action
  with:
    token: ${{ steps.generate-token.outputs.token }}
```

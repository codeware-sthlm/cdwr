<p align="center">
  <br />
  <img width="200" src="../../assets/cdwr-cloud.png" alt="codeware sthlm logo">
  <br />
  <br />
</p>

<h1 align='center'>Fly Destroy Action</h1>

<p align='center'>
  GitHub action that destroys Fly.io preview applications when a pull request is closed.
  <br />
  <br />
  &nbsp;
  <a href='../../LICENSING.md'><img src='https://img.shields.io/badge/License-FSL--1.1--MIT-green.svg' alt='FSL-1.1-MIT'></a>
  <br />
  <br />
</p>

## Description

Tears down Fly.io applications that were created for a pull request's preview environment. Runs automatically when a PR is closed, cleaning up all preview apps associated with that PR (including multi-tenant deployments).

## Usage

```yaml
destroy:
  if: github.event_name == 'pull_request' && github.event.action == 'closed'
  runs-on: ubuntu-latest

  steps:
    - uses: actions/checkout@v4

    # Install dependencies, build the action...

    - name: Install Fly CLI
      uses: superfly/flyctl-actions/setup-flyctl@master

    - name: Destroy preview apps
      uses: ./packages/fly-destroy-action
      with:
        fly-api-token: ${{ secrets.FLY_API_TOKEN }}
        token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

See [action.yml](action.yml) for descriptions of all inputs.

## Outputs

| Output      | Description                                         |
| ----------- | --------------------------------------------------- |
| `destroyed` | List of app names that were successfully destroyed. |
| `skipped`   | List of app names that could not be destroyed.      |

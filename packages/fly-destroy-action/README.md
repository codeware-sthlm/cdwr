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
        # Optional: also drop the PR's database
        postgres-cluster: ${{ vars.FLY_POSTGRES_PREVIEW }}
        database-name: cdwr_cms_${PR_NUMBER}
```

## Inputs

See [action.yml](action.yml) for descriptions of all inputs.

### Databases

Set `postgres-cluster` and `database-name` together to also drop preview databases; leaving both empty skips databases, setting only one fails the action.

- `database-name` is a template and must contain `${PR_NUMBER}` exactly once, for example `cdwr_cms_${PR_NUMBER}`. Every database on the cluster matching it whose pull request is closed is dropped, and so are the roles Fly created for closed PRs' apps (such as `cdwr_cms_pr_575_moon`).
- The password is the cluster's own `OPERATOR_PASSWORD`, read inside the machine over `fly ssh`; no database credentials are passed to the action.
- The cluster's volume usage is reported first, with a warning at 80% or more.
- A failed drop is a warning, never a failed job.
- `dry-run: true` lists what would be destroyed or dropped without doing it.

## Outputs

| Output              | Description                                         |
| ------------------- | --------------------------------------------------- |
| `destroyed`         | List of app names that were successfully destroyed. |
| `skipped`           | List of app names that could not be destroyed.      |
| `dropped-databases` | List of database names that were dropped.           |
| `skipped-databases` | List of database names that could not be dropped.   |

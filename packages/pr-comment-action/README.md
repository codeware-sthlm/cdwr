<p align="center">
  <br />
  <img width="200" src="../../assets/cdwr-cloud.png" alt="codeware sthlm logo">
  <br />
  <br />
</p>

<h1 align='center'>PR Comment Action</h1>

<p align='center'>
  GitHub action that posts a deployment status comment to a pull request.
  <br />
  <br />
  &nbsp;
  <a href='../../LICENSING.md'><img src='https://img.shields.io/badge/License-FSL--1.1--MIT-green.svg' alt='FSL-1.1-MIT'></a>
  <br />
  <br />
</p>

## Description

Posts a deployment status summary as a comment on the pull request. Updates the comment on each run so the PR always shows the latest deployment state. The comment includes deployed URLs and any failures.

## Usage

This action is typically the last step after [fly-deployment-action](https://github.com/codeware-sthlm/cdwr/tree/main/packages/fly-deployment-action#readme). It uses the `deployed` and `failed` outputs from the deployment step.

```yaml
pr-comment:
  needs: [pre-deploy, deploy]
  if: always() && github.event_name == 'pull_request' && github.event.action != 'closed'
  runs-on: ubuntu-latest

  steps:
    - uses: actions/checkout@v4

    # Install dependencies, build the action...

    - name: Post PR comment
      uses: ./packages/pr-comment-action
      with:
        pull-request: ${{ github.event.number }}
        environment: ${{ needs.deploy.outputs.environment }}
        deployed: ${{ needs.deploy.outputs.deployed }}
        failed: ${{ needs.deploy.outputs.failed }}
        token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

See [action.yml](action.yml) for descriptions of all inputs.

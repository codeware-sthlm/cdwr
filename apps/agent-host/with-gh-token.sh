#!/bin/zsh
# The GitHub app's installation token for one command `cdwr agent exec` runs, when that command
# declares `needs: gh` (worktree prune, deploy, …): GH_TOKEN and GITHUB_TOKEN, the app's token on
# cdwr only, for that command and the processes it starts, never the scheduler loop or a claude
# session. It lasts an hour, minted once. secrets.sh runs first, so the App key is on the tmpfs, and
# the entrypoint wrote the identity beside it. The helper is the installed copy the git credential
# helper sources too. A failed mint ends here, with its reason and exit 75, before the command starts;
# no other exit of the wrapper is 75.
setopt err_exit pipe_fail no_unset

source "${AGENT_HOST_GITHUB_APP:-/home/agent/.cdwr/agent-queue/github-app.sh}"
if ! { app_env "${AGENT_HOST_RUN_DIR:-/run/agent}/app.env" && app_token; }; then
  exit 75
fi
# 75 is the mint's alone: the command's own 75 reads as 1, so exec never names the mint for it
rc=0
"$@" || rc=$?
(( rc == 75 )) && rc=1
exit $rc

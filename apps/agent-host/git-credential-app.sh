#!/bin/zsh
# git credential helper for https://github.com: answers `get` with a fresh installation token
setopt err_exit pipe_fail no_unset
[[ "${1:-}" == get ]] || exit 0

source "${AGENT_QUEUE_HOME}/github-app.sh"
app_env /run/agent/app.env
app_token

print -r -- "username=x-access-token"
print -r -- "password=$GH_TOKEN"

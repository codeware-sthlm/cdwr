#!/bin/zsh
# git credential helper for https://github.com: answers `get` with a fresh installation token.
# Runs as the queue's user, from its own git or through sudo from an implement session's, where
# the environment is reset: the paths are the image's, not the environment's.
setopt err_exit pipe_fail no_unset
[[ "${1:-}" == get ]] || exit 0

source /home/agent/.cdwr/agent-queue/github-app.sh
app_env /run/agent/app.env
app_token

print -r -- "username=x-access-token"
print -r -- "password=$GH_TOKEN"

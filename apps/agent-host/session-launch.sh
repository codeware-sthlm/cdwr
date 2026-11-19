#!/bin/zsh
# The implement sessions' launcher: implement.sh runs it as `session` through sudo, and it starts
# claude with the arguments it was given. Owned by root in the image, so neither user can change
# what the other crosses into. The environment is what the sudoers file keeps plus what is set
# here: the session's own home and claude home, the queue home it reads and the sessions dir it
# writes under the queue's user, its own pnpm store, the clone its ticket worktrees hang off, and
# a git credential helper that asks the queue's user for a fresh installation token.
setopt err_exit no_unset pipe_fail

export HOME=/home/session
# The queue home stays the queue user's: wait.sh, session.sh and the hook look there
export CDWR_HOME=/home/agent/.cdwr
export AGENT_QUEUE_NOTIFY_SPOOL="$CDWR_HOME/agent-queue/notify-spool"
export pnpm_config_store_dir=/session-pnpm-store
export AGENT_QUEUE_WORKTREE_REPO=/work/codeware-session
export GIT_TERMINAL_PROMPT=0
# The checkout claude runs from is the queue user's: git refuses another owner's repo otherwise
git config --global --add safe.directory "${AGENT_QUEUE_REPO:?}"

# A fresh installation token at every git call, bought by the queue's user: the session never
# holds the App key
git config --global --unset-all credential.https://github.com.helper 2>/dev/null || true
git config --global credential.https://github.com.helper ''
git config --global --add credential.https://github.com.helper \
  '!sudo -n -u agent /opt/agent-host/git-credential-app.sh'

# The clone the ticket worktrees are linked to, so none of them writes into the queue's checkout
if [[ ! -d "$AGENT_QUEUE_WORKTREE_REPO/.git" ]]; then
  git clone -q https://github.com/codeware-sthlm/cdwr.git "$AGENT_QUEUE_WORKTREE_REPO"
  git -C "$AGENT_QUEUE_WORKTREE_REPO" checkout -q --detach origin/main
fi

# Trust the checkout claude runs from, as the entrypoint does for the queue's user
(
  umask 077
  cfg="$HOME/.claude.json"
  { [[ -s "$cfg" ]] && cat "$cfg" || print -r -- '{}' } |
    jq --arg repo "${AGENT_QUEUE_REPO:?}" '.projects[$repo].hasTrustDialogAccepted = true' > "$cfg.tmp" &&
    mv "$cfg.tmp" "$cfg"
)

cd "$AGENT_QUEUE_REPO"
exec claude "$@"

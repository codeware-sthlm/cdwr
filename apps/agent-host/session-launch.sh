#!/bin/zsh
# Every claude run's launcher in the container: run.sh and implement.sh run it as `session` through
# sudo (claude_launch in lib.sh), and it starts claude with the arguments it was given. Owned by root in the image, so neither user can change
# what the other crosses into. The environment is what the sudoers file keeps plus what is set
# here: the session's own home and claude home, the queue home it reads and the sessions dir it
# writes under the queue's user, its own pnpm store, the clone its ticket worktrees hang off, and
# a git credential helper that asks the queue's user for a fresh installation token.
setopt err_exit no_unset pipe_fail
# What the session writes is readable by the queue group, so the queue's user reads its review file
# and its session rows; nobody else reads them
umask 027

export HOME=/home/session
# The queue home stays the queue user's: wait.sh, session.sh and the hook look there
export CDWR_HOME=/home/agent/.cdwr
export AGENT_QUEUE_NOTIFY_SPOOL="$CDWR_HOME/agent-queue/notify-spool"
export pnpm_config_store_dir=/session-pnpm-store
export AGENT_QUEUE_WORKTREE_REPO=/work/codeware-session
export GIT_TERMINAL_PROMPT=0
# The checkout claude runs from is the queue user's: git refuses another owner's repo otherwise
# Every claude run comes through here, some while another runs, so each setting is written only when
# it differs: a rewrite would leave a running git without its helper for a moment
git config --global --get-all safe.directory 2>/dev/null | grep -qxF "${AGENT_QUEUE_REPO:?}" ||
  git config --global --add safe.directory "$AGENT_QUEUE_REPO"

# A fresh installation token at every git call, bought by the queue's user: the session never
# holds the App key
helper='!sudo -n -u agent /opt/agent-host/git-credential-app.sh'
if [[ "$(git config --global --get-all credential.https://github.com.helper 2>/dev/null || true)" != $'\n'"$helper" ]]; then
  git config --global --unset-all credential.https://github.com.helper 2>/dev/null || true
  git config --global credential.https://github.com.helper ''
  git config --global --add credential.https://github.com.helper "$helper"
fi

# The clone the ticket worktrees are linked to, so none of them writes into the queue's checkout
if [[ ! -d "$AGENT_QUEUE_WORKTREE_REPO/.git" ]]; then
  git clone -q https://github.com/codeware-sthlm/cdwr.git "$AGENT_QUEUE_WORKTREE_REPO"
  git -C "$AGENT_QUEUE_WORKTREE_REPO" checkout -q --detach origin/main
fi

# Trust the checkout claude runs from, as the entrypoint does for the queue's user
# Trusted once is enough: a rewrite while another claude runs could drop what that one wrote
(
  umask 077
  cfg="$HOME/.claude.json"
  jq -e --arg repo "${AGENT_QUEUE_REPO:?}" '.projects[$repo].hasTrustDialogAccepted == true' "$cfg" >/dev/null 2>&1 && exit 0
  tmp="$(mktemp "$cfg.XXXXXX")"
  { [[ -s "$cfg" ]] && cat "$cfg" || print -r -- '{}' } |
    jq --arg repo "$AGENT_QUEUE_REPO" '.projects[$repo].hasTrustDialogAccepted = true' > "$tmp" &&
    mv "$tmp" "$cfg"
)

# The planners' memory, staged by the entrypoint from the queue user's, merged into this user's
# file by file: the newer copy wins, and the index gains the lines it lacks
merge_memory() {
  local stage="$CDWR_HOME/agent-queue/memory-from-agent" f name tmp
  local dst="$HOME/.claude/projects/${AGENT_QUEUE_REPO//\//-}/memory"
  local -a index missing
  [[ -d "$stage" ]] || return 0
  mkdir -p "$dst"
  for f in "$stage"/*.md(N); do
    name="${f:t}"
    [[ "$name" == MEMORY.md ]] && continue
    [[ -e "$dst/$name" && ! "$f" -nt "$dst/$name" ]] && continue
    tmp="$(mktemp "$dst/.merge.XXXXXX")"
    cp -p "$f" "$tmp" && chmod 640 "$tmp" && mv -f "$tmp" "$dst/$name"
  done
  [[ -r "$stage/MEMORY.md" ]] || return 0
  [[ -r "$dst/MEMORY.md" ]] && index=("${(@f)$(<"$dst/MEMORY.md")}")
  for f in "${(@f)$(<"$stage/MEMORY.md")}"; do
    [[ -n "$f" ]] && (( ! ${index[(Ie)$f]} )) && missing+=("$f")
  done
  (( ${#missing} )) || return 0
  tmp="$(mktemp "$dst/.merge.XXXXXX")"
  print -rl -- "${index[@]}" "${missing[@]}" > "$tmp" && chmod 640 "$tmp" && mv -f "$tmp" "$dst/MEMORY.md"
}
( merge_memory ) || print -ru2 -- "session-launch: could not merge the staged memory"

# Claude writes its transcripts mode 600 whatever the umask, and the queue's user counts their
# usage (usage-record): they are opened to the group before claude starts and once it ends. A stop
# (session-stop.sh) reaches this shell, which passes it on.
share_transcripts() { [[ ! -d "$HOME/.claude/projects" ]] || chmod -R g+rX "$HOME/.claude/projects" 2>/dev/null || true; }
share_transcripts
cd "$AGENT_QUEUE_REPO"
claude "$@" &
pid=$!
trap 'kill -TERM $pid 2>/dev/null' TERM INT HUP
rc=0
wait $pid || rc=$?
# wait returns early on a trapped signal; let claude finish
while kill -0 $pid 2>/dev/null; do rc=0; wait $pid || rc=$?; done
share_transcripts
exit $rc

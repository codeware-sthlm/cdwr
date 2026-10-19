#!/bin/zsh
# Starts the agent queue in a container: App identity, first-time checkout, then the run loop.
setopt err_exit pipe_fail no_unset

typeset -a missing
for v in AGENT_GITHUB_APP_ID AGENT_GITHUB_APP_INSTALLATION_ID AGENT_GITHUB_APP_KEY AGENT_QUEUE_LINEAR_KEY CLAUDE_CODE_OAUTH_TOKEN; do
  [[ -n "${(P)v:-}" ]] || missing+=("$v")
done
if (( ${#missing} )); then
  print -ru2 -- "agent-host: missing ${(j:, :)missing}"
  exit 1
fi

KEY_PATH=/run/agent/app.pem
ENV_FILE="$AGENT_QUEUE_REPO/tools/cdwr/.env"

# The queue files the image carries, where run.sh compares them with origin/main
cp /opt/agent-queue/* "$AGENT_QUEUE_HOME/"

# The key stays out of git config and logs: a tmpfs file, mode 600 as github-app.sh requires
mkdir -p /run/agent
(umask 077; print -r -- "$AGENT_GITHUB_APP_KEY" > "$KEY_PATH")
chmod 600 "$KEY_PATH"
unset AGENT_GITHUB_APP_KEY

# The identity on the tmpfs too: the credential helper reads it, and it exists before the first clone
(umask 077; print -rl -- "AGENT_GITHUB_APP_ID=$AGENT_GITHUB_APP_ID" \
  "AGENT_GITHUB_APP_INSTALLATION_ID=$AGENT_GITHUB_APP_INSTALLATION_ID" \
  "AGENT_GITHUB_APP_KEY_PATH=$KEY_PATH" > /run/agent/app.env)

git config --global --unset-all credential.https://github.com.helper 2>/dev/null || true
git config --global credential.https://github.com.helper ''
git config --global --add credential.https://github.com.helper /opt/agent-host/git-credential-app.sh
export GIT_TERMINAL_PROMPT=0

# The scripts' app_env reads the identity from the checkout's .env
write_env() {
  mkdir -p "${ENV_FILE:h}"
  local -a keep
  [[ -f "$ENV_FILE" ]] && keep=("${(@f)$(grep -v '^AGENT_GITHUB_APP_' "$ENV_FILE" || true)}")
  {
    (( ${#keep} )) && print -rl -- "${keep[@]}"
    print -r -- "AGENT_GITHUB_APP_ID=$AGENT_GITHUB_APP_ID"
    print -r -- "AGENT_GITHUB_APP_INSTALLATION_ID=$AGENT_GITHUB_APP_INSTALLATION_ID"
    print -r -- "AGENT_GITHUB_APP_KEY_PATH=$KEY_PATH"
  } > "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
}

if [[ ! -d "$AGENT_QUEUE_REPO/.git" ]]; then
  # git clones into an empty directory only, so .env goes in once the clone is there
  git clone https://github.com/codeware-sthlm/cdwr.git "$AGENT_QUEUE_REPO"
  git -C "$AGENT_QUEUE_REPO" checkout --detach origin/main
fi
# Apart from the clone. The marker comes only after a finished install, so a failed or
# interrupted one is tried again on the next start
INSTALLED="$AGENT_QUEUE_REPO/node_modules/.agent-host-installed"
if [[ ! -f "$INSTALLED" ]]; then
  (cd "$AGENT_QUEUE_REPO" && pnpm install --frozen-lockfile)
  touch "$INSTALLED"
fi
write_env

# One runner per container: a lock left by a killed run is stale
rmdir "$AGENT_QUEUE_HOME/lock" 2>/dev/null || true

stop=0
runner=
sleeper=
trap 'stop=1; [[ -n "$runner" ]] && kill -TERM $runner 2>/dev/null; [[ -n "$sleeper" ]] && kill $sleeper 2>/dev/null; true' TERM INT

while (( ! stop )); do
  # In the background, so a stop reaches run.sh and its exit trap frees the lock
  "$AGENT_QUEUE_HOME/run.sh" &
  runner=$!
  wait $runner || true
  # wait returns early on a trapped signal; let run.sh finish its exit trap
  kill -0 $runner 2>/dev/null && { wait $runner || true; }
  runner=
  (( stop )) && break
  sleep "$RUN_INTERVAL_SECONDS" &
  sleeper=$!
  wait $sleeper || true
  sleeper=
done

# A detached implementing session is not run.sh's child, so the stop above does not reach it.
# It is not a group leader (nohup in a script has no job control), so the pid itself gets TERM
# and its EXIT trap frees implement.lock within the compose stop_grace_period.
impl_pid="$(cat "$AGENT_QUEUE_HOME/implement.lock/pid" 2>/dev/null || true)"
if [[ "$impl_pid" == <-> ]] && kill -0 "$impl_pid" 2>/dev/null; then
  print -r -- "agent-host: stopping the implementing session $impl_pid, waiting up to 100s"
  kill -TERM "$impl_pid" 2>/dev/null || true
  for (( i = 0; i < 100; i++ )); do
    kill -0 "$impl_pid" 2>/dev/null || break
    sleep 1
  done
  if kill -0 "$impl_pid" 2>/dev/null; then
    print -r -- "agent-host: the implementing session $impl_pid did not stop in 100s, giving up"
  fi
fi

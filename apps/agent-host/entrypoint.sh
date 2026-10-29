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

# The Linear key the same way, where the image's AGENT_QUEUE_LINEAR_KEY_FILE points: lib.sh reads
# the file, and no process inherits the key itself
: "${AGENT_QUEUE_LINEAR_KEY_FILE:=/run/agent/linear.key}"
export AGENT_QUEUE_LINEAR_KEY_FILE
mkdir -p "${AGENT_QUEUE_LINEAR_KEY_FILE:h}"
(umask 077; print -r -- "$AGENT_QUEUE_LINEAR_KEY" > "$AGENT_QUEUE_LINEAR_KEY_FILE")
chmod 600 "$AGENT_QUEUE_LINEAR_KEY_FILE"
unset AGENT_QUEUE_LINEAR_KEY

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
pending=0
woken=0
runner=
sleeper=
supervisor=
# Before the listener starts: SIGUSR1's default action would end the loop
trap 'stop=1; [[ -n "$runner" ]] && kill -TERM $runner 2>/dev/null; [[ -n "$sleeper" ]] && kill $sleeper 2>/dev/null; [[ -n "$supervisor" ]] && kill -TERM $supervisor 2>/dev/null; true' TERM INT
# A wake only cuts the sleep short; during a run it is kept for right after
trap 'pending=1; [[ -n "$sleeper" ]] && kill $sleeper 2>/dev/null; true' USR1

# The listener (`cdwr agent listen`) wakes the loop on Supabase events and keeps listener.json
# beating; without its env the loop polls every RUN_INTERVAL_SECONDS as before
LISTENER_FILE="$AGENT_QUEUE_HOME/listener.json"
loop_pid=$$
# Restarts the listener with a back-off of 5 s doubling to 5 min, reset after 10 min up
supervise_listener() {
  local backoff=5 started listener=
  trap '[[ -n "$listener" ]] && kill -TERM $listener 2>/dev/null; exit 0' TERM
  while true; do
    started=$SECONDS
    (cd "$AGENT_QUEUE_REPO" && exec node tools/cdwr/bin/cdwr.mjs agent listen --notify-pid "$loop_pid") &
    listener=$!
    wait $listener || true
    listener=
    if (( SECONDS - started >= 600 )); then backoff=5; fi
    print -r -- "agent-host: the listener exited, restarting in ${backoff}s"
    # In the background, so a stop isn't held up by the back-off
    sleep $backoff &
    wait $! || true
    (( backoff = backoff * 2 > 300 ? 300 : backoff * 2 ))
  done
}
if [[ -n "${AGENT_SUPABASE_URL:-}" && -n "${AGENT_SUPABASE_ANON_KEY:-}" ]]; then
  supervise_listener &
  supervisor=$!
else
  print -r -- "agent-host: no AGENT_SUPABASE_URL or AGENT_SUPABASE_ANON_KEY, polling every ${RUN_INTERVAL_SECONDS}s"
fi

# The listener is live: its file says so and it beat under 2 min ago
listener_live() {
  local beat
  beat="$(jq -r 'select(.state == "live") | .lastBeat | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601' "$LISTENER_FILE" 2>/dev/null)" || return 1
  [[ "$beat" == <-> ]] && (( $(date +%s) - beat < 120 ))
}

# The Sentry monitor expects a check-in every RUN_INTERVAL_SECONDS; between runs the loop sends them
source "$AGENT_QUEUE_HOME/checkin.sh"

while (( ! stop )); do
  pending=0
  # In the background, so a stop reaches run.sh and its exit trap frees the lock
  if (( woken )); then "$AGENT_QUEUE_HOME/run.sh" --wake & else "$AGENT_QUEUE_HOME/run.sh" & fi
  runner=$!
  # wait returns early on every trapped signal, a wake included; only run.sh's exit ends it
  while kill -0 $runner 2>/dev/null; do wait $runner || true; done
  runner=
  (( stop )) && break
  # Sleeps in steps of RUN_INTERVAL_SECONDS, up to RUN_FALLBACK_SECONDS while the listener is live.
  # A step that finds the listener down, or an activity read a woken run skipped, runs at once.
  slept=0
  while (( ! stop && ! pending )); do
    sleep "$RUN_INTERVAL_SECONDS" &
    sleeper=$!
    # A wake between the check and the line above found no sleeper to stop
    (( pending )) && kill $sleeper 2>/dev/null
    wait $sleeper || true
    sleeper=
    (( stop || pending )) && break
    (( slept += RUN_INTERVAL_SECONDS ))
    if (( slept >= ${RUN_FALLBACK_SECONDS:-3600} )) || [[ -e "$AGENT_QUEUE_HOME/activity-owed" ]] || ! listener_live; then
      break
    fi
    checkin ok
  done
  woken=$pending
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

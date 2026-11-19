#!/bin/zsh
# Starts the agent queue in a container: App identity, first-time checkout, then the run loop.
setopt err_exit pipe_fail no_unset

RUN_DIR="${AGENT_HOST_RUN_DIR:-/run/agent}"
KEY_PATH="$RUN_DIR/app.pem"
ENV_FILE="$AGENT_QUEUE_REPO/tools/cdwr/.env"
# secrets.sh wrote the key secrets here (mode 600, the App key as github-app.sh requires) and kept
# them out of this script's environment, so no process inherits them. lib.sh reads the Linear
# files where these point, buys its token from the app file and keeps it on the same tmpfs
: "${AGENT_QUEUE_LINEAR_KEY_FILE:=$RUN_DIR/linear.key}"
: "${AGENT_QUEUE_LINEAR_APP_FILE:=$RUN_DIR/linear-app.env}"
export AGENT_QUEUE_LINEAR_KEY_FILE AGENT_QUEUE_LINEAR_APP_FILE

typeset -a missing
for v in AGENT_GITHUB_APP_ID AGENT_GITHUB_APP_INSTALLATION_ID CLAUDE_CODE_OAUTH_TOKEN; do
  [[ -n "${(P)v:-}" ]] || missing+=("$v")
done
[[ -s "$KEY_PATH" ]] || missing+=("AGENT_GITHUB_APP_KEY (no $KEY_PATH)")
# Linear: the app's client id and secret, or the key they replace until it is revoked
if [[ ! -s "$AGENT_QUEUE_LINEAR_APP_FILE" && ! -s "$AGENT_QUEUE_LINEAR_KEY_FILE" ]]; then
  missing+=("AGENT_QUEUE_LINEAR_CLIENT_ID and AGENT_QUEUE_LINEAR_CLIENT_SECRET (or AGENT_QUEUE_LINEAR_KEY)")
fi
if (( ${#missing} )); then
  print -ru2 -- "agent-host: missing ${(j:, :)missing}"
  exit 1
fi

# The queue files the image carries, where run.sh compares them with origin/main
cp /opt/agent-queue/* "$AGENT_QUEUE_HOME/"

# The implement sessions run as another user, and the queue group is what the two share: /work
# takes their clone and ticket worktrees beside this checkout, the queue home is theirs to read,
# the sessions dir and the notice spool theirs to write. Docker applies the image's modes to a
# new, empty volume only, so this runs at every start.
chgrp queue /work && chmod 1775 /work
chgrp -R queue "$AGENT_QUEUE_HOME" && chmod 750 "$AGENT_QUEUE_HOME" && chmod -R g+rX "$AGENT_QUEUE_HOME"
install -d -m 2770 -g queue "$AGENT_QUEUE_HOME/sessions" "$AGENT_QUEUE_HOME/notify-spool"
chmod -R g+rwX "$AGENT_QUEUE_HOME/sessions" "$AGENT_QUEUE_HOME/notify-spool"
# Ticket worktrees from before the session user are linked to this checkout and are this user's:
# a session can neither use nor remove them, so they go, once. A deploy waits for an idle queue,
# so none holds work in flight, and every branch is on origin.
if [[ -d "$AGENT_QUEUE_REPO/.git" ]]; then
  for wt in /work/codeware-cod-*(N/); do
    if [[ "$(git -C "$wt" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" == "$AGENT_QUEUE_REPO/.git" ]]; then
      print -r -- "agent-host: removing the ticket worktree $wt, which belongs to the queue's user"
      git -C "$AGENT_QUEUE_REPO" worktree remove --force "$wt" || rm -rf "$wt"
    fi
  done
  git -C "$AGENT_QUEUE_REPO" worktree prune || true
fi

# The identity on the tmpfs too: the credential helper reads it, and it exists before the first clone
(umask 077; print -rl -- "AGENT_GITHUB_APP_ID=$AGENT_GITHUB_APP_ID" \
  "AGENT_GITHUB_APP_INSTALLATION_ID=$AGENT_GITHUB_APP_INSTALLATION_ID" \
  "AGENT_GITHUB_APP_KEY_PATH=$KEY_PATH" > "$RUN_DIR/app.env")

git config --global --unset-all credential.https://github.com.helper 2>/dev/null || true
git config --global credential.https://github.com.helper ''
git config --global --add credential.https://github.com.helper /opt/agent-host/git-credential-app.sh
export GIT_TERMINAL_PROMPT=0

# The scripts' app_env reads the identity from the checkout's .env
write_env() {
  mkdir -p "${ENV_FILE:h}"
  local -a keep
  [[ -f "$ENV_FILE" ]] && keep=("${(@f)$(grep -v '^AGENT_GITHUB_APP_' "$ENV_FILE" || true)}")
  # Mode 600: the file holds the Supabase service key, which a session must not read
  (
    umask 077
    {
      (( ${#keep} )) && print -rl -- "${keep[@]}"
      print -r -- "AGENT_GITHUB_APP_ID=$AGENT_GITHUB_APP_ID"
      print -r -- "AGENT_GITHUB_APP_INSTALLATION_ID=$AGENT_GITHUB_APP_INSTALLATION_ID"
      print -r -- "AGENT_GITHUB_APP_KEY_PATH=$KEY_PATH"
    } > "$ENV_FILE.tmp"
  )
  chmod 600 "$ENV_FILE.tmp"
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

# Trust the checkout every scheduled claude runs from, so its .claude/settings.json allow rule
# applies (COD-798). ~/.claude.json sits beside the claude-home volume, in the container's own
# layer, so a redeploy starts it empty; the merge keeps every key Claude Code wrote since. A
# broken file leaves the checkout untrusted rather than stopping the start
trust_checkout() {
  local cfg="$HOME/.claude.json"
  { [[ -s "$cfg" ]] && cat "$cfg" || print -r -- '{}' } |
    jq --arg repo "$AGENT_QUEUE_REPO" '.projects[$repo].hasTrustDialogAccepted = true' > "$cfg.tmp" &&
    mv "$cfg.tmp" "$cfg"
}
(umask 077; trust_checkout) || print -r -- "agent-host: could not trust $AGENT_QUEUE_REPO in ~/.claude.json"

# The implement sessions' project memory, seeded once from this user's into their claude home
# (group-writable for this): what an implement run may and may not do lives there
seed_session_memory() {
  local slug="${AGENT_QUEUE_REPO//\//-}"
  local src="$HOME/.claude/projects/$slug/memory" dst="/home/session/.claude/projects/$slug/memory"
  [[ -d "$src" && ! -d "$dst" ]] || return 0
  (umask 002; mkdir -p "$dst" && cp -n "$src"/*.md "$dst"/)
}
seed_session_memory || print -r -- "agent-host: could not seed the session memory"

# The listener runs from the checkout, so a start (a deploy) brings it to origin/main first, the way
# run.sh's to_main does before it plans: same lockfile marker, and a dirty checkout stays as it is
(
  cd "$AGENT_QUEUE_REPO"
  if git fetch -q origin && git switch -q --detach origin/main 2>/dev/null; then
    lock="$(git hash-object pnpm-lock.yaml)"
    marker=node_modules/.cdwr-lockfile
    if [[ ! -r "$marker" || "$(<"$marker")" != "$lock" ]]; then
      pnpm install --frozen-lockfile && print -r -- "$lock" > "$marker"
    fi
  else
    print -r -- "agent-host: the checkout stays where it is (not clean, or no fetch)"
  fi
) || print -r -- "agent-host: could not bring the checkout to origin/main"

# One runner per container: a lock left by a killed run is stale
rm -rf "$AGENT_QUEUE_HOME/lock"

stop=0
pending=0
woken=0
runner=
sleeper=
supervisor=
proxy_supervisor=
# Before the listener starts: SIGUSR1's default action would end the loop
trap 'stop=1; [[ -n "$runner" ]] && kill -TERM $runner 2>/dev/null; [[ -n "$sleeper" ]] && kill $sleeper 2>/dev/null; [[ -n "$supervisor" ]] && kill -TERM $supervisor 2>/dev/null; [[ -n "$proxy_supervisor" ]] && kill -TERM $proxy_supervisor 2>/dev/null; true' TERM INT
# A wake only cuts the sleep short; during a run it is kept for right after
trap 'pending=1; [[ -n "$sleeper" ]] && kill $sleeper 2>/dev/null; true' USR1

# The claude runs' Linear MCP (COD-658): the proxy on 127.0.0.1:AGENT_QUEUE_LINEAR_PROXY_PORT signs
# their calls and refuses tools outside linear-tools.txt, which the cp above put in the queue home.
# Restarted with the listener's back-off; it runs before the first run.sh, whose gate asks it.
supervise_proxy() {
  local backoff=5 started proxy=
  trap '[[ -n "$proxy" ]] && kill -TERM $proxy 2>/dev/null; exit 0' TERM
  while true; do
    started=$SECONDS
    node /opt/agent-host/linear-mcp-proxy.mjs &
    proxy=$!
    wait $proxy || true
    proxy=
    if (( SECONDS - started >= 600 )); then backoff=5; fi
    print -r -- "agent-host: the Linear proxy exited, restarting in ${backoff}s"
    sleep $backoff &
    wait $! || true
    (( backoff = backoff * 2 > 300 ? 300 : backoff * 2 ))
  done
}
supervise_proxy &
proxy_supervisor=$!
# The first run's gate asks the proxy, so it gets up to 10 s to listen (any answer will do)
for (( i = 0; i < 20; i++ )); do
  curl -s -m 1 -o /dev/null "http://127.0.0.1:${AGENT_QUEUE_LINEAR_PROXY_PORT:-8790}/" && break
  sleep 0.5
done

# The listener (`cdwr agent listen`) wakes the loop on Supabase events and keeps listener.json
# beating; without its env the loop polls every RUN_INTERVAL_SECONDS as before
LISTENER_FILE="$AGENT_QUEUE_HOME/listener.json"
loop_pid=$$
# `cdwr agent run` in the container wakes the loop through this file, as the listener does
print -r -- "$loop_pid" > "$AGENT_QUEUE_HOME/loop.pid"
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
# The host's load, memory and disk go to Supabase every HOST_METRICS_INTERVAL_SECONDS (else every
# RUN_INTERVAL_SECONDS), the desk's NUC heartbeat, from a sampler of its own: a long run or a
# slow Supabase never holds it, and it never ends the loop. telemetry_env
# runs inside it only, as it un-exports the key every run.sh the loop starts needs.
source "$AGENT_QUEUE_HOME/telemetry.sh"
# What the implement sessions can't send themselves, holding neither the key nor the webhook:
# their session rows, from the files the hook writes, and the notices notify.sh spooled. Each
# session file is sent when it changed since its stamp; a notice is removed once it is posted.
relay_sessions() {
  local file stamp id host state detail
  for file in "$AGENT_QUEUE_HOME"/sessions/*.json(N); do
    stamp="$file.relayed"
    [[ -f "$stamp" && ! "$file" -nt "$stamp" ]] && continue
    # The stamp takes the file's time before the read, so a change during the send is seen next
    touch -r "$file" "$stamp"
    IFS=$'\x1f' read -r id host state detail <<<"$(jq -r '[.id, .host, .state, .detail] | map(. // "") | join("\u001f")' "$file" 2>/dev/null)" || continue
    [[ -n "$id" ]] || continue
    # A file mirrored from another host is that host's session, which sends its own row
    [[ -z "$host" || "$host" == "$(hostname -s)" ]] || continue
    telemetry_session "$id" implement "$state" "$detail" || true
  done
}
relay_notices() {
  local file url text
  url="${SLACK_WEBHOOK_URL:-${CLAUDE_SLACK_WEBHOOK:-}}"
  [[ -z "$url" && -r "$HOME/.claude/slack-webhook" ]] && url="$(tr -d '[:space:]' < "$HOME/.claude/slack-webhook")"
  [[ -n "$url" ]] || return 0
  for file in "$AGENT_QUEUE_HOME"/notify-spool/*.json(N); do
    text="$(jq -r '.text // empty' "$file" 2>/dev/null)" || { rm -f "$file"; continue; }
    if [[ -z "$text" ]] || jq -nc --arg text "$text" '{text: $text}' |
        curl -sS -m 5 -X POST -H 'Content-Type: application/json' --data @- "$url" >/dev/null 2>&1; then
      rm -f "$file"
    fi
  done
}
(
  telemetry_env "$ENV_FILE"
  while true; do
    telemetry_host_metrics || true
    relay_sessions || true
    relay_notices || true
    sleep "${HOST_METRICS_INTERVAL_SECONDS:-$RUN_INTERVAL_SECONDS}"
  done
) &!

while (( ! stop )); do
  pending=0
  # In the background, so a stop reaches run.sh and its exit trap frees the lock
  if (( woken )); then "$AGENT_QUEUE_HOME/run.sh" --wake & else "$AGENT_QUEUE_HOME/run.sh" & fi
  runner=$!
  # wait returns early on every trapped signal, a wake included; only run.sh's exit ends it
  st=0; wait $runner || st=$?
  while kill -0 $runner 2>/dev/null; do st=0; wait $runner || st=$?; done
  runner=
  (( stop )) && break
  # Sleeps in steps of RUN_INTERVAL_SECONDS, up to RUN_FALLBACK_SECONDS while the listener is live
  # and the last run went through. A step that finds the listener down, an activity read a woken
  # run skipped, or a failed run behind it runs at once, so a failure is retried every 10 minutes
  # and never covered by a heartbeat.
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
    if (( st != 0 || slept >= ${RUN_FALLBACK_SECONDS:-3600} )) || [[ -e "$AGENT_QUEUE_HOME/activity-owed" ]] || ! listener_live; then
      break
    fi
    checkin ok
    # The platform step between runs, so tenant_state stays about 10 minutes fresh in a quiet
    # spell. It detaches the collection and returns in a second; a failure never ends the loop.
    "$AGENT_QUEUE_HOME/run.sh" --platform || true
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

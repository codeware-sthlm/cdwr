#!/bin/zsh
# Background watcher for an attended /work-queue session: re-picks from Linear and exits when the
# attended pick changes, or after --max seconds so the session can re-arm it. A `run` pick it has
# not reported to this session yet (<id>.seen) exits at once, so work that landed before it started is not missed.
# So does the session's own ticket running (the session file's `ticket`), reported as `resume: <ticket> · <detail>`:
# the session is polling, so its own work is what it picks up again. `--now` reads the same way.
# It wakes on events: it starts `cdwr agent listen --notify-pid $$` from its own checkout, with a
# state file of its own, and re-picks on SIGUSR1. While that listener is live (its file says so,
# with a beat under 2 min), the clock re-picks only every --fallback seconds; without it (no
# Supabase env in tools/cdwr/.env, a listener that exited) every --interval, as before. A listener
# that dies mid-wait is not restarted; the next wait.sh starts a fresh one.
# Runs from the repo, not installed. While it runs, <id>.watcher holds its pid and the hook reports `polling` on Stop.
#   wait.sh [--interval 60] [--fallback 600] [--max 6600]
#   wait.sh --now        print the current pick once and exit, with no listener
# Where the scheduler runs elsewhere (a Mac without the launchd job), the watch state comes from
# the NUC's queue_state row (`remote_watch`, one Supabase GET per pick) instead of the local
# watch.json nothing refreshes; unreadable, the local file as before.
# AGENT_QUEUE_LINEAR_CMD replaces the Linear call with a command that prints a response,
# AGENT_QUEUE_GH_CMD the gh call that reads parked tickets' PRs (the query is its $1),
# AGENT_QUEUE_LISTEN_CMD the listener (run as `<cmd> <pid to wake> <state file>`), and
# AGENT_QUEUE_WATCH_CMD the remote watch read (prints `{host, at, watch}` or nothing).
INTERVAL=60
FALLBACK=600
MAX=6600
NOW=false
while (( $# )); do
  case "$1" in
    --interval) INTERVAL="${2:?--interval needs seconds}"; shift 2 ;;
    --fallback) FALLBACK="${2:?--fallback needs seconds}"; shift 2 ;;
    --max) MAX="${2:?--max needs seconds}"; shift 2 ;;
    --now) NOW=true; shift ;;
    *) print -ru2 -- "usage: wait.sh [--interval <s>] [--fallback <s>] [--max <s>] [--now]"; exit 2 ;;
  esac
done
[[ "$INTERVAL" == <-> && "$FALLBACK" == <-> && "$MAX" == <-> ]] || { print -ru2 -- "wait.sh: seconds must be whole numbers"; exit 2; }

HERE="${0:A:h}"
source "$HERE/lib.sh"
source "$HERE/waits.sh"
source "$HERE/telemetry.sh"
# telemetry's warnings go through note; the wait stays quiet while offline, as before
note() { return 0; }
if [[ -n "${AGENT_QUEUE_LINEAR_CMD:-}" ]]; then
  linear() { eval "$AGENT_QUEUE_LINEAR_CMD"; }
elif ! linear_auth; then
  print -r -- "wait: no Linear credentials"; exit 0
fi
# The Supabase env for the remote watch, found as the status line finds it
[[ -n "${AGENT_QUEUE_WATCH_CMD:-}" ]] || telemetry_env_search "${HERE:h:h:h}"

BASE="${CDWR_HOME:-$HOME/.cdwr}/agent-queue"
SESSIONS="${AGENT_QUEUE_SESSIONS:-$BASE/sessions}"
WATCH_FILE="$BASE/watch.json"
file=""
watcher=""

# The registered session, by session.sh id: the newest live file whose pid is one of our ancestors
find_session() {
  setopt local_options no_err_exit no_nomatch
  local hit
  hit="$("$HERE/session.sh" id 2>/dev/null)"
  [[ -n "$hit" && "$hit" != *[^A-Za-z0-9_-]* && -f "$SESSIONS/$hit.json" ]] && file="$SESSIONS/$hit.json"
  return 0
}

# The pid file lives next to the session file; the hook reads it on Stop
write_watcher() {
  [[ -n "$file" ]] || return 0
  watcher="${file%.json}.watcher"
  print -r -- "$$" > "$watcher.tmp.$$" && mv "$watcher.tmp.$$" "$watcher" || { rm -f "$watcher.tmp.$$"; watcher=""; }
  return 0
}
remove_watcher() {
  [[ -n "$watcher" && "$(cat "$watcher" 2>/dev/null)" == "$$" ]] && rm -f "$watcher"
  return 0
}

# The last pick reported to the session; without a session nothing is remembered
seen_key() { [[ -n "$file" ]] && cat "${file%.json}.seen" 2>/dev/null; return 0; }
remember() {
  [[ -n "$file" ]] || return 0
  local seen="${file%.json}.seen"
  print -r -- "$1" > "$seen.tmp.$$" && mv "$seen.tmp.$$" "$seen" || rm -f "$seen.tmp.$$"
  return 0
}

# pick: the attended verdict as JSON; fails on a Linear or jq error. The watch state comes from
# watch_state (lib.sh): the local file where the scheduler runs, else the NUC's row
pick() {
  local resp watch waits renovate
  resp="$(linear "$ATTENDED_QUERY" | attended_nodes)" || return 1
  jq -e '.data.issues.nodes' >/dev/null <<<"$resp" 2>/dev/null || return 1
  watch_state "$WATCH_FILE"
  watch="$WATCH_STATE"
  [[ -n "$watch" ]] || watch='{}'
  renovate="$RENOVATE_STATE"
  [[ -n "$renovate" ]] || renovate='{}'
  waits="$(parked_waits <<<"$resp")"
  jq -L "$HERE" -c --argjson now "$(date +%s)" --argjson limit "$(queue_limit "$BASE")" --argjson watch "$watch" --argjson waits "$waits" \
    --argjson renovate "$renovate" --argjson session "$session_json" \
    'include "watch"; .data.issues.nodes | attended($now; $limit; $watch; $waits; $renovate; $session)' <<<"$resp"
}
# What the printed line shows: waiting and the limit only for an idle pick. A running line's
# detail is this session's own Next line, so it stays out
key_of() { jq -c '{verdict, ticket, reason} + (if .verdict == "idle" then {waiting, used, limit} else {} end)' <<<"$1"; }
line_of() { jq -r -L "$HERE" 'include "watch"; attended_line' <<<"$1"; }
# The session's own ticket is among the resumable ones
own() { [[ -n "$ticket" ]] && jq -e --arg t "$ticket" -L "$HERE" 'include "watch"; own_pick($t)' <<<"$1" >/dev/null; }
# <prefix>: <line>, or the resume line for the session's own ticket
report() {
  if own "$2"; then jq -r --arg t "$ticket" -L "$HERE" 'include "watch"; resume_line($t)' <<<"$2"
  else print -r -- "$1: $(line_of "$2")"; fi
}

# find_session needs nothing below, so --now can read it first
find_session
ticket=""
sid=""
if [[ -n "$file" ]]; then
  ticket="$(jq -r '.ticket // empty' "$file" 2>/dev/null)"
  sid="$(jq -r '.id // empty' "$file" 2>/dev/null)"
fi
session_json=null
[[ -n "$file" ]] && session_json="$(jq -nc --arg id "$sid" --arg t "$ticket" \
  '{state: "alive", detail: "polling", id: $id, ticket: (if $t == "" then null else $t end)}')"

if $NOW; then
  now="$(pick)" || { offline && print -r -- "wait: offline" || print -r -- "wait: Linear did not answer"; exit 0; }
  if own "$now"; then jq -r --arg t "$ticket" -L "$HERE" 'include "watch"; resume_line($t)' <<<"$now"; else line_of "$now"; fi
  exit 0
fi

# The listener: its state file and log live in a temp dir of this wait's own, never in the
# sessions dir (everything there globs *.json as a session) nor in the queue home (status reads
# listener.json there as the scheduler's)
tmp=""
listener=""
LISTENER_FILE=""
# The listener needs the Supabase url and publishable key, from the shell or the env file: the
# one AGENT_QUEUE_ENV_FILE names, else the checkout's tools/cdwr/.env. Without them it would only
# boot to fail, so the wait says so and polls
listener_env() {
  local v file="${AGENT_QUEUE_ENV_FILE:-$1/tools/cdwr/.env}"
  for v in AGENT_SUPABASE_URL AGENT_SUPABASE_ANON_KEY; do
    [[ -n "${(P)v}" ]] || grep -q "^$v=." "$file" 2>/dev/null || return 1
  done
  return 0
}
start_listener() {
  # The checkout this script runs from. The shim takes the checkout the caller stands in, and
  # cdwr loads that one's tools/cdwr/.env, so the listener starts from its root
  local root="${HERE:h:h:h}"
  if [[ -z "${AGENT_QUEUE_LISTEN_CMD:-}" ]] && ! listener_env "$root"; then
    print -ru2 -- "wait: no AGENT_SUPABASE_URL or AGENT_SUPABASE_ANON_KEY for $root, polling every ${INTERVAL}s"
    return 0
  fi
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/wait-listener.XXXXXX")" || { tmp=""; return 0; }
  LISTENER_FILE="$tmp/listener.json"
  if [[ -n "${AGENT_QUEUE_LISTEN_CMD:-}" ]]; then
    "$AGENT_QUEUE_LISTEN_CMD" "$$" "$LISTENER_FILE" > "$tmp/listener.log" 2>&1 &
  else
    (cd "$root" && exec node tools/cdwr/bin/cdwr.mjs agent listen --notify-pid "$$" --state-file "$LISTENER_FILE") > "$tmp/listener.log" 2>&1 &
  fi
  listener=$!
  return 0
}
# TERM reaches every process under the listener's pid, children first: the shim (cdwr.mjs) runs
# tsx with spawnSync and forwards no signal, and the listener itself is the deepest one
kill_tree() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$child"; done
  kill -TERM "$1" 2>/dev/null
  return 0
}
stop_listener() {
  local i
  if [[ -n "$listener" ]]; then
    kill_tree "$listener"
    # Up to 5 s for the listener to close its channel and write its last state before the dir goes
    for (( i = 0; i < 25; i++ )); do kill -0 "$listener" 2>/dev/null || break; sleep 0.2; done
  fi
  [[ -n "$tmp" ]] && rm -rf "$tmp"
  return 0
}
# Live: the file says so and it beat under 2 min ago, the entrypoint's rule
listener_live() {
  local beat
  [[ -n "$LISTENER_FILE" ]] || return 1
  beat="$(jq -r 'select(.state == "live") | .lastBeat | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601' "$LISTENER_FILE" 2>/dev/null)" || return 1
  [[ "$beat" == <-> ]] && (( $(date +%s) - beat < 120 ))
}

# A wake cuts the sleep short; one that lands while picking is kept for the next nap
woken=0
sleeper=""
nap() {
  (( woken )) && return 0
  sleep "$1" &
  sleeper=$!
  # A wake between the check and the line above found no sleeper to stop
  (( woken )) && kill "$sleeper" 2>/dev/null
  wait "$sleeper" 2>/dev/null
  sleeper=""
  return 0
}

write_watcher
trap 'stop_listener; remove_watcher' EXIT
trap 'exit 0' INT TERM HUP
# Before the listener starts: SIGUSR1's default action would end the wait
trap 'woken=1; [[ -n "$sleeper" ]] && kill "$sleeper" 2>/dev/null; true' USR1
start_listener

start=""
until start="$(pick)"; do
  (( SECONDS >= MAX )) && { print -r -- "timeout: Linear did not answer"; exit 0; }
  woken=0
  nap "$INTERVAL"
done
# A wake that landed during the start pick (the listener's catch-up on subscribe) is spent on it
woken=0
start_key="$(key_of "$start")"
if [[ "$start_key" != "$(seen_key)" ]] && { [[ "$(jq -r '.verdict' <<<"$start")" == run ]] || own "$start"; }; then
  remember "$start_key"
  report changed "$start"
  exit 0
fi

while true; do
  (( SECONDS >= MAX )) && break
  if listener_live; then
    # A wake re-picks at once; the clock only every FALLBACK, in steps of INTERVAL so a listener
    # that died is noticed within a step and the wait goes back to the clock
    slept=0
    while (( slept < FALLBACK )) && listener_live; do
      nap "$INTERVAL"
      (( woken )) && break
      (( slept += INTERVAL ))
      (( SECONDS >= MAX )) && break
    done
  else
    nap "$INTERVAL"
  fi
  woken=0
  # An error counts as unchanged; the next tick tries again
  now="$(pick)" || { (( SECONDS >= MAX )) && break; continue; }
  if [[ "$(key_of "$now")" != "$start_key" ]]; then
    remember "$(key_of "$now")"
    report changed "$now"
    exit 0
  fi
  last="$now"
done
remember "$(key_of "${last:-$start}")"
report timeout "${last:-$start}"
exit 0

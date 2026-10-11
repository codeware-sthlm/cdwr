#!/bin/zsh
# Background watcher for an attended /work-queue session: polls Linear and exits when the
# attended pick changes, or after --max seconds so the session can re-arm it.
# Runs from the repo, not installed. While it runs, <id>.watcher holds its pid and the hook reports `polling` on Stop.
#   wait.sh [--interval 60] [--max 6600]
# AGENT_QUEUE_LINEAR_CMD replaces the Linear call with a command that prints a response.
INTERVAL=60
MAX=6600
while (( $# )); do
  case "$1" in
    --interval) INTERVAL="${2:?--interval needs seconds}"; shift 2 ;;
    --max) MAX="${2:?--max needs seconds}"; shift 2 ;;
    *) print -ru2 -- "usage: wait.sh [--interval <s>] [--max <s>]"; exit 2 ;;
  esac
done
[[ "$INTERVAL" == <-> && "$MAX" == <-> ]] || { print -ru2 -- "wait.sh: seconds must be whole numbers"; exit 2; }

HERE="${0:A:h}"
source "$HERE/lib.sh"
if [[ -n "${AGENT_QUEUE_LINEAR_CMD:-}" ]]; then
  linear() { eval "$AGENT_QUEUE_LINEAR_CMD"; }
elif [[ -z "$key" ]]; then
  print -r -- "wait: no Linear key"; exit 0
fi

BASE="${CDWR_HOME:-$HOME/.cdwr}/agent-queue"
SESSIONS="${AGENT_QUEUE_SESSIONS:-$BASE/sessions}"
WATCH_FILE="$BASE/watch.json"
file=""
watcher=""

# The registered session: among the session files whose pid is one of our ancestors, skip the
# ended ones and take the newest lastSeen
find_session() {
  setopt local_options no_err_exit
  [[ -d "$SESSIONS" ]] || return 0
  local pid=$$ hit
  while [[ "$pid" == <-> ]] && (( pid > 1 )); do
    hit="$(jq -rs --argjson pid "$pid" \
      '[.[] | select(.pid == $pid and .state != "ended" and (.id | type == "string"))] | sort_by(.lastSeen) | last | .id // empty' \
      "$SESSIONS"/*.json 2>/dev/null)"
    [[ -n "$hit" && "$hit" != *[^A-Za-z0-9_-]* ]] && { file="$SESSIONS/$hit.json"; return 0; }
    pid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
  done
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

# pick: the attended verdict as JSON; fails on a Linear or jq error
pick() {
  local resp watch
  resp="$(linear "$ATTENDED_QUERY")" || return 1
  jq -e '.data.issues.nodes' >/dev/null <<<"$resp" 2>/dev/null || return 1
  watch="$(jq -c 'if type == "object" then . else {} end' "$WATCH_FILE" 2>/dev/null || print '{}')"
  [[ -n "$watch" ]] || watch='{}'
  jq -L "$HERE" -c --argjson now "$(date +%s)" --argjson watch "$watch" \
    'include "watch"; .data.issues.nodes | attended($now; 5; $watch)' <<<"$resp"
}
key_of() { jq -c '{verdict, ticket, reason, waiting}' <<<"$1"; }
line_of() { jq -r -L "$HERE" 'include "watch"; attended_line' <<<"$1"; }

find_session
write_watcher
trap remove_watcher EXIT
trap 'exit 0' INT TERM HUP

start=""
until start="$(pick)"; do
  (( SECONDS >= MAX )) && { print -r -- "timeout: Linear did not answer"; exit 0; }
  sleep "$INTERVAL"
done
start_key="$(key_of "$start")"

while true; do
  (( SECONDS >= MAX )) && break
  sleep "$INTERVAL"
  # An error counts as unchanged; the next tick tries again
  now="$(pick)" || { (( SECONDS >= MAX )) && break; continue; }
  if [[ "$(key_of "$now")" != "$start_key" ]]; then
    print -r -- "changed: $(line_of "$now")"
    exit 0
  fi
  last="$now"
done
print -r -- "timeout: $(line_of "${last:-$start}")"
exit 0

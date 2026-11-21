#!/bin/zsh
# Markers for the work-queue session heartbeat: `session.sh register` and `session.sh ticket`
# do nothing themselves. The PostToolUse hook (session-hook.sh) sees the line they print and
# writes the session file, since only hooks are told the session id. `session.sh id` prints the id
# of the registered session whose process is an ancestor of this one, and exits 1 when none is.
usage() { print -ru2 -- "usage: session.sh register | session.sh ticket <COD-n | -> | session.sh id"; exit 2 }
session_id() {
  setopt local_options no_err_exit no_nomatch
  local dir="${AGENT_QUEUE_SESSIONS:-${CDWR_HOME:-$HOME/.cdwr}/agent-queue/sessions}" pid=$$ hit
  [[ -d "$dir" ]] || return 1
  while [[ "$pid" == <-> ]] && (( pid > 1 )); do
    hit="$(jq -rs --argjson pid "$pid" \
      '[.[] | select(.pid == $pid and .state != "ended" and (.id | type == "string"))] | sort_by(.lastSeen) | last | .id // empty' \
      "$dir"/*.json 2>/dev/null)"
    if [[ -n "$hit" ]]; then
      [[ "$hit" == *[^A-Za-z0-9_-]* ]] && return 1
      print -r -- "$hit"; return 0
    fi
    pid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
  done
  return 1
}
case "${1:-}" in
  register) print -r -- "registered work-queue session" ;;
  ticket)
    case "${2:-}" in
      COD-<->|-) print -r -- "work-queue ticket $2" ;;
      *) usage ;;
    esac ;;
  id) session_id || exit 1 ;;
  *) usage ;;
esac

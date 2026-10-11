#!/bin/zsh
# One hook script for the work-queue session heartbeat (PostToolUse, Notification, Stop,
# SessionEnd). Registered in .claude/settings.json; payload arrives as JSON on stdin.
# It touches a session file only after `session.sh register` created it, always exits 0 and
# prints nothing, so a failure never shows in a session.
exec >/dev/null 2>&1

setopt extended_glob
DIR="${AGENT_QUEUE_SESSIONS:-${CDWR_HOME:-$HOME/.cdwr}/agent-queue/sessions}"
# The claude process: the nearest ancestor named claude, since a shell may sit in between
claude_pid() {
  local p=$PPID
  while [[ "$p" == <-> ]] && (( p > 1 )); do
    [[ "$(ps -o comm= -p "$p")" == (*/|)claude ]] && { print -r -- "$p"; return 0; }
    p="$(ps -o ppid= -p "$p" | tr -d ' ')"
  done
  print -r -- "$PPID"
}

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# patch <jq filter> [jq args]: rewrites the session file atomically
patch() {
  local filter=$1; shift
  jq "$@" "$filter" "$file" > "$file.tmp.$$" && mv "$file.tmp.$$" "$file" || { rm -f "$file.tmp.$$"; return 1; }
}

main() {
  local payload id event tool cmd kind reason file wp state
  payload="$(cat)" || return 0
  id="$(jq -r '.session_id // empty' <<<"$payload")" || return 0
  event="$(jq -r '.hook_event_name // empty' <<<"$payload")" || return 0
  # The id becomes a file name
  [[ -n "$id" && "$id" != *[^A-Za-z0-9_-]* ]] || return 0
  file="$DIR/$id.json"

  if [[ "$event" == PostToolUse ]]; then
    tool="$(jq -r '.tool_name // empty' <<<"$payload")"
    cmd="$(jq -r '.tool_input.command // empty' <<<"$payload")"
    # Only the bare command registers: an optional path prefix, nothing else on the line
    cmd="${${cmd##[[:space:]]##}%%[[:space:]]##}"
    if [[ "$tool" == Bash && "$cmd" == (([^[:space:]\;\&\|\`\$\(\)\<\>]##/|))tools/cdwr/agent-queue/session.sh\ register ]]; then
      mkdir -p "$DIR" || return 0
      jq -n --arg id "$id" --argjson pid "$(claude_pid)" --arg now "$(now)" \
        --arg cwd "$(jq -r '.cwd // empty' <<<"$payload")" \
        '{id: $id, pid: $pid, startedAt: $now, lastSeen: $now, state: "working", ticket: null,
          detail: null, cwd: $cwd}' > "$file.tmp.$$" &&
        mv "$file.tmp.$$" "$file" || rm -f "$file.tmp.$$"
      return 0
    fi
  fi

  [[ -f "$file" ]] || return 0

  case "$event" in
    PostToolUse)
      patch '.lastSeen = $now | .state = "working" | .detail = null' --arg now "$(now)" ;;
    Notification)
      kind="$(jq -r '.notification_type // empty' <<<"$payload")"
      case "$kind" in
        permission_prompt|elicitation_dialog)
          patch '.lastSeen = $now | .state = "waiting" | .detail = $kind' --arg now "$(now)" --arg kind "$kind" ;;
      esac ;;
    Stop)
      wp="$(cat "$DIR/$id.watcher" 2>/dev/null)"
      state=stopped
      [[ "$wp" == <-> ]] && kill -0 "$wp" 2>/dev/null && state=polling
      patch '.lastSeen = $now | .state = $state' --arg now "$(now)" --arg state "$state" ;;
    SessionEnd)
      # The docs call the field `reason`; `end_reason` is the older spelling
      reason="$(jq -r '.reason // .end_reason // empty' <<<"$payload")"
      patch '.lastSeen = $now | .state = "ended" | .detail = ($reason | if . == "" then null else . end)' \
        --arg now "$(now)" --arg reason "$reason" ;;
  esac
  return 0
}

main || true
exit 0

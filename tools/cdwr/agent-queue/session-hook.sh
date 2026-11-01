#!/bin/zsh
# One hook script for the work-queue session heartbeat (PostToolUse, Notification, Stop,
# SessionEnd). Registered in .claude/settings.json; payload arrives as JSON on stdin.
# It touches a session file only after `session.sh register` created it, always exits 0 and
# prints nothing, so a failure never shows in a session.
exec >/dev/null 2>&1

setopt extended_glob
zmodload zsh/stat 2>/dev/null
HOOK_DIR="${0:A:h}"
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

# host_id: the machine's stable name; lib.sh has the twin (this script does not source it)
host_id() { [[ "$(uname)" == Darwin ]] && scutil --get LocalHostName 2>/dev/null || hostname -s; }

# mirror <force>: copies the session file to the target named on the first line of ../mirror
# (the queue home's `mirror` file, written by `cdwr agent mirror set`), at most once a minute per
# session unless forced. A target is `host:dir`, or `host:docker:container:dir` to write inside a
# container on that host; one with any character outside [A-Za-z0-9._@/:-] is ignored, since it
# ends up in a remote command line.
# Transfers run detached and one at a time per session: a copy that finds another in flight
# leaves a `pending` mark, which the running one picks up, so the newest state is always the
# last sent. Each copy writes its own temp name on the host and renames it, so a reader never
# sees half a file. Failures are ignored. AGENT_QUEUE_MIRROR_CMD replaces ssh in specs, with the
# file in $MIRROR_FILE and the target split into $MIRROR_HOST, $MIRROR_CONTAINER (empty for a
# plain target) and $MIRROR_DIR.
mirror() {
  local target stamp="$file.mirrored" last now_s
  target="$(head -n 1 "$DIR/../mirror" 2>/dev/null | tr -d '[:space:]')"
  [[ "$target" =~ '^[A-Za-z0-9._@/:-]+$' && "${file:t}" =~ '^[A-Za-z0-9._-]+$' ]] || return 0
  # Nor may the host or a container start like an ssh or docker option
  [[ "$target" != -* && "$target" != *:docker:-* ]] || return 0
  if [[ "$1" != force && -f "$stamp" ]]; then
    now_s="$(date +%s)"; last="$(zstat +mtime "$stamp" 2>/dev/null)"
    [[ "$last" == <-> ]] && (( now_s - last < 60 )) && return 0
  fi
  : > "$stamp"
  ( mirror_send "$target" ) &!
  return 0
}

# One transfer at a time per session; the lock is a directory, stale after a minute
mirror_send() {
  local target=$1 lock="$file.mirroring" host dir container="" name="${file:t}" tmp
  host="${target%%:*}"; dir="${target#*:}"
  if [[ "$dir" =~ '^docker:([^:]+):(.+)$' ]]; then container=$match[1]; dir=$match[2]; fi
  [[ -d "$lock" && "$(zstat +mtime "$lock" 2>/dev/null)" == <-> ]] &&
    (( $(date +%s) - $(zstat +mtime "$lock") > 60 )) && rmdir "$lock" 2>/dev/null
  if ! mkdir "$lock" 2>/dev/null; then : > "$file.pending"; return 0; fi
  while :; do
    rm -f "$file.pending"
    tmp="$name.tmp.$$.$RANDOM"
    if [[ -n "${AGENT_QUEUE_MIRROR_CMD:-}" ]]; then
      ( export MIRROR_FILE="$file" MIRROR_HOST="$host" MIRROR_CONTAINER="$container" MIRROR_DIR="$dir"
        eval "$AGENT_QUEUE_MIRROR_CMD" )
    elif [[ -n "$container" ]]; then
      # As the image's user, so the file lands where the container's run.sh reads it
      ssh -q -o BatchMode=yes -o ConnectTimeout=3 "$host" \
        "docker exec -i '$container' sh -c 'mkdir -p \"\$1\" && cat > \"\$1/\$2\" && mv -f \"\$1/\$2\" \"\$1/\$3\"' _ '$dir' '$tmp' '$name'" < "$file"
    else
      ssh -q -o BatchMode=yes -o ConnectTimeout=3 "$host" "cat > '$dir/$tmp' && mv -f '$dir/$tmp' '$dir/$name'" < "$file"
    fi
    [[ -e "$file.pending" ]] || break
  done
  rmdir "$lock" 2>/dev/null
  # A mark left between the check and the unlock is sent by a fresh transfer
  [[ -e "$file.pending" ]] && mirror_send "$target"
  return 0
}

# One upsert at a time per session, each reading the state as it sends, so a send still in flight
# never lands after a newer one. A busy sender is told by a pending mark and sends again. The lock
# is a directory, stale after a minute.
beat_send() {
  local lock="$file.beating" sstate sdetail
  [[ -d "$lock" && "$(zstat +mtime "$lock" 2>/dev/null)" == <-> ]] &&
    (( $(date +%s) - $(zstat +mtime "$lock") > 60 )) && rmdir "$lock" 2>/dev/null
  if ! mkdir "$lock" 2>/dev/null; then : > "$file.beatpending"; return 0; fi
  while :; do
    rm -f "$file.beatpending"
    IFS=$'\x1f' read -r sstate sdetail <<<"$(jq -r '[.state, .detail] | map(. // "") | join("\u001f")' "$file" 2>/dev/null)"
    telemetry_session "$id" "${AGENT_QUEUE_SESSION_KIND:-attended}" "$sstate" "$sdetail"
    [[ -e "$file.beatpending" ]] || break
  done
  rmdir "$lock" 2>/dev/null
  [[ -e "$file.beatpending" ]] && beat_send
  return 0
}

# heartbeat <state before> <state after>: upserts the session, with its state and detail, into the
# telemetry database, at most once a minute per session. A change of state beats at once, so the
# desk never keeps `working` for a session that stopped within the minute. The stamp is written
# first and the send runs detached, so a tool call never waits on the network; SessionEnd waits
# for a send in flight and then sends itself, since a detached child may not outlive the exiting
# claude. kind is `implement` for a launched session (implement.sh exports it), `attended` otherwise.
heartbeat() {
  local stamp="$file.beat" last now_s n
  if [[ "$1" == "$2" && -f "$stamp" ]]; then
    now_s="$(date +%s)"; last="$(zstat +mtime "$stamp" 2>/dev/null)"
    [[ "$last" == <-> ]] && (( now_s - last < 60 )) && return 0
  fi
  source "$HOOK_DIR/telemetry.sh" 2>/dev/null || return 0
  # The file a launched session was told, else this checkout's, else the main checkout's,
  # which is where a linked worktree finds the credentials
  local env_file proj="${CLAUDE_PROJECT_DIR:-$HOOK_DIR/../../..}" common main_env=""
  common="$(git -C "$proj" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" &&
    main_env="${common:h}/tools/cdwr/.env"
  for env_file in "${AGENT_QUEUE_ENV_FILE:-}" "$proj/tools/cdwr/.env" "$main_env"; do
    [[ -n "$env_file" ]] && telemetry_env "$env_file"
    telemetry_on && break
  done
  telemetry_on || return 0
  : > "$stamp"
  if [[ "$event" == SessionEnd ]]; then
    # A send's curl gives up after 10 s
    for n in {1..22}; do [[ -d "$file.beating" ]] || break; sleep 0.5; done
    beat_send
  else
    ( beat_send ) &!
  fi
  return 0
}

# patch <jq filter> [jq args]: rewrites the session file atomically
patch() {
  local filter=$1; shift
  jq "$@" "$filter" "$file" > "$file.tmp.$$" && mv "$file.tmp.$$" "$file" || { rm -f "$file.tmp.$$"; return 1; }
}

main() {
  local payload id event tool cmd out line ticket kind reason file wp state
  payload="$(cat)" || return 0
  # One jq for the scalars: this runs after every tool call in every session
  # Unit separator, not tab: IFS whitespace would collapse an empty field
  IFS=$'\x1f' read -r id event tool <<<"$(jq -r '[.session_id, .hook_event_name, .tool_name] | map(. // "" | tostring) | join("\u001f")' <<<"$payload")" || return 0
  # The id becomes a file name
  [[ -n "$id" && "$id" != *[^A-Za-z0-9_-]* ]] || return 0
  file="$DIR/$id.json"

  if [[ "$event" == PostToolUse && "$tool" == Bash ]]; then
    cmd="$(jq -r '.tool_input.command // empty' <<<"$payload")"
    # The line session.sh prints registers, so a `cd … &&` prefix or a chained command still
    # counts; grepping or printing the script never outputs that line on its own.
    # The bare command is the fallback for a payload without the output.
    out="$(jq -r '.tool_response.stdout // empty' <<<"$payload")"
    cmd="${${cmd##[[:space:]]##}%%[[:space:]]##}"
    if [[ $'\n'"$out"$'\n' == *$'\n'"registered work-queue session"$'\n'* ||
          "$cmd" == (([^[:space:]\;\&\|\`\$\(\)\<\>]##/|))tools/cdwr/agent-queue/session.sh\ register ]]; then
      mkdir -p "$DIR" || return 0
      # A session resumed after it ended beats at once
      state="$(jq -r '.state // empty' "$file" 2>/dev/null)"
      jq -n --arg id "$id" --argjson pid "$(claude_pid)" --arg now "$(now)" \
        --arg cwd "$(jq -r '.cwd // empty' <<<"$payload")" --arg host "$(host_id)" \
        '{id: $id, pid: $pid, startedAt: $now, lastSeen: $now, state: "working", ticket: null,
          detail: null, cwd: $cwd, host: $host}' > "$file.tmp.$$" &&
        mv "$file.tmp.$$" "$file" || rm -f "$file.tmp.$$"
      mirror force
      heartbeat "$state" working
      return 0
    fi
    # `session.sh ticket COD-n` (or `-` to clear) names the ticket in hand, read the same way;
    # the last such line wins
    for line in "${(@f)out}"; do
      [[ "$line" == work-queue\ ticket\ (COD-<->|-) ]] && ticket="${line#work-queue ticket }"
    done
    [[ -z "$ticket" && "$cmd" == (([^[:space:]\;\&\|\`\$\(\)\<\>]##/|))tools/cdwr/agent-queue/session.sh\ ticket\ (COD-<->|-) ]] &&
      ticket="${cmd##* }"
  fi

  [[ -f "$file" ]] || return 0
  # The state before this event, so a change is mirrored at once
  local before after
  before="$(jq -r '.state // empty' "$file" 2>/dev/null)"

  case "$event" in
    PostToolUse)
      if [[ -n "$ticket" ]]; then
        patch '.lastSeen = $now | .state = "working" | .detail = null
          | .ticket = (if $ticket == "-" then null else $ticket end)' --arg now "$(now)" --arg ticket "$ticket"
      else
        patch '.lastSeen = $now | .state = "working" | .detail = null' --arg now "$(now)"
      fi ;;
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
  # A state or ticket change always mirrors; same-state heartbeats at most once a minute
  after="$(jq -r '.state // empty' "$file" 2>/dev/null)"
  if [[ "$event" == (Stop|SessionEnd) || "$after" != "$before" || -n "$ticket" ]]; then mirror force
  else mirror
  fi
  heartbeat "$before" "$after"
  return 0
}

main || true
exit 0

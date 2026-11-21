#!/bin/zsh
# A queue notice, the one way a notice leaves a script or a session.
#   notify.sh [--level urgent|action|info] [--source <name>] [--ticket COD-n] <message...>
#   notify.sh < {message, cwd}       the hook's JSON form on stdin
#   notify.sh --passes <level>       exits 0 when the dial lets the level through to Slack, else 1
#   notify.sh --send <level> <text>  posts the text as it is, prefixed on urgent; 0 posted, 1 failed,
#                                    3 no webhook. The drain and the relay post through it
#   notify.sh --dial                 prints the dial as {level, muteUntil}, muteUntil null unless in force
# The message goes out as `*<project>* \`<branch>\`: <message>`, from the current directory or the JSON
# cwd. A session under dontAsk uses the arguments: any `$` in a command, quoted or not, gets it
# denied, and the JSON form needs one. Without --level a notice is action, the JSON form too; without
# --source it is `session`; without --ticket the first COD-n in the message names it.
#
# Where it goes: into the spool as <epoch>-<pid>.json, {text, level, source, ticket, at}, when
# AGENT_QUEUE_NOTIFY_SPOOL names one (the container's sessions, which hold no webhook), or when the
# queue home's notices-drained-at says a drain reached Supabase under 30 minutes ago (the spool is
# then <queue home>/notify-spool). The drain (notices_drain in telemetry.sh) moves the spool into the
# `notices` table and only the NUC relay posts rows to Slack. Otherwise it is posted straight to the
# webhook when the dial lets it through, and without a webhook it is a silent no-op.
#
# The dial is the queue home's notify-level, `urgent`, `action` or `all`; a missing or unknown one
# reads as urgent. Until the ISO time in notify-mute-until only urgent passes. Urgent always passes.
# The queue home is AGENT_QUEUE_HOME, else ~/.cdwr/agent-queue. The webhook comes from
# SLACK_WEBHOOK_URL, CLAUDE_SLACK_WEBHOOK or ~/.claude/slack-webhook. AGENT_QUEUE_CURL_CMD replaces
# the curl call in specs (JSON body on stdin).

home="${AGENT_QUEUE_HOME:-$HOME/.cdwr/agent-queue}"
LEVELS=(urgent action info)

# The dial's level: urgent, action or all
dial_level() {
  local level
  level="$(tr -d '[:space:]' 2>/dev/null < "$home/notify-level")"
  [[ "$level" == (urgent|action|all) ]] && print -r -- "$level" || print -r -- urgent
}
# The mute's end when it is still ahead, else nothing
mute_until() {
  local until
  until="$(tr -d '[:space:]' 2>/dev/null < "$home/notify-mute-until")"
  [[ -n "$until" ]] || return 0
  jq -nre --arg t "$until" '$t | sub("\\.[0-9]+"; "") | fromdateiso8601 | select(. > now) | $t' 2>/dev/null
  return 0
}
notify_passes() {
  [[ "$1" == urgent ]] && return 0
  [[ -z "$(mute_until)" ]] || return 1
  case "$(dial_level)" in
    all) [[ "$1" == (action|info) ]] ;;
    action) [[ "$1" == action ]] ;;
    *) return 1 ;;
  esac
}

webhook() {
  local url="${SLACK_WEBHOOK_URL:-${CLAUDE_SLACK_WEBHOOK:-}}"
  [[ -z "$url" && -r "$HOME/.claude/slack-webhook" ]] && url="$(tr -d '[:space:]' < "$HOME/.claude/slack-webhook")"
  print -r -- "$url"
}
# send <level> <text>
send() {
  local url text=$2 body
  url="$(webhook)"
  [[ -n "$url" ]] || return 3
  [[ "$1" == urgent ]] && text=":rotating_light: $text"
  body="$(jq -nc --arg text "$text" '{text: $text}')" || return 1
  if [[ -n "${AGENT_QUEUE_CURL_CMD:-}" ]]; then
    print -r -- "$body" | eval "$AGENT_QUEUE_CURL_CMD" >/dev/null 2>&1
  else
    print -r -- "$body" |
      curl -sS -f -m 5 -X POST -H 'Content-Type: application/json' --data @- "$url" >/dev/null 2>&1
  fi
}

case "${1:-}" in
  --passes)
    notify_passes "${2:-}"
    exit $?
    ;;
  --send)
    (( ${LEVELS[(Ie)${2:-}]} )) && [[ -n "${3:-}" ]] || { print -ru2 -- "notify.sh: --send takes a level and a text"; exit 2; }
    send "$2" "$3"
    exit $?
    ;;
  --dial)
    jq -nc --arg level "$(dial_level)" --arg until "$(mute_until)" \
      '{level: $level, muteUntil: (if $until == "" then null else $until end)}'
    exit 0
    ;;
esac

level=action source=session ticket=
while (( $# )); do
  case "$1" in
    --level) level="${2:-}"; shift 2 || shift ;;
    --source) source="${2:-}"; shift 2 || shift ;;
    --ticket) ticket="${2:-}"; shift 2 || shift ;;
    --) shift; break ;;
    *) break ;;
  esac
done
(( ${LEVELS[(Ie)$level]} )) || { print -ru2 -- "notify.sh: --level is urgent, action or info"; exit 2; }

if (( $# > 0 )); then
  message="$*" cwd="$PWD"
else
  input="$(cat)"
  message="$(jq -r '.message // "Claude needs your attention"' <<<"$input")"
  cwd="$(jq -r '.cwd // empty' <<<"$input")"
fi
project="${cwd:t}"
branch="$(git -C "${cwd:-.}" branch --show-current 2>/dev/null)"
[[ -n "$ticket" ]] || { [[ "$message" =~ 'COD-[0-9]+' ]] && ticket="$MATCH"; }

text="*${project:-claude}*${branch:+ \`$branch\`}: $message"

spool="${AGENT_QUEUE_NOTIFY_SPOOL:-}"
if [[ -z "$spool" ]]; then
  drained="$(cat "$home/notices-drained-at" 2>/dev/null)"
  [[ "$drained" == <-> ]] && (( $(date +%s) - drained < 1800 )) && spool="$home/notify-spool"
fi
if [[ -n "$spool" ]]; then
  # Written under a temp name and renamed, so a reader never sees half a file
  name="$(date +%s)-$$.json"
  {
    mkdir -p "$spool" &&
      jq -nc --arg text "$text" --arg level "$level" --arg source "$source" --arg ticket "$ticket" \
        --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{text: $text, level: $level, source: $source, ticket: (if $ticket == "" then null else $ticket end), at: $at}' \
        > "$spool/.$name.tmp" &&
      mv -f "$spool/.$name.tmp" "$spool/$name"
  } 2>/dev/null
  exit 0
fi

notify_passes "$level" && send "$level" "$text"
exit 0

#!/bin/zsh
# Posts a queue notice to Slack. Takes the message as arguments, from the current directory, or
# reads {message, cwd} as JSON on stdin as a hook does. A session under dontAsk uses the arguments:
# any `$` in a command, quoted or not, gets it denied, and the JSON form needs one. The webhook comes from
# SLACK_WEBHOOK_URL, CLAUDE_SLACK_WEBHOOK or ~/.claude/slack-webhook. Without one, a directory named
# by AGENT_QUEUE_NOTIFY_SPOOL gets the notice as <epoch>-<pid>.json, {text, at}, for a relay to post;
# without that too it is a silent no-op. AGENT_QUEUE_CURL_CMD replaces the curl call in specs (JSON body on stdin).

url="${SLACK_WEBHOOK_URL:-${CLAUDE_SLACK_WEBHOOK:-}}"
[[ -z "$url" && -r "$HOME/.claude/slack-webhook" ]] && url="$(tr -d '[:space:]' < "$HOME/.claude/slack-webhook")"
spool="${AGENT_QUEUE_NOTIFY_SPOOL:-}"
[[ -z "$url" && -z "$spool" ]] && exit 0

if (( $# > 0 )); then
  message="$*" cwd="$PWD"
else
  input="$(cat)"
  message="$(jq -r '.message // "Claude needs your attention"' <<<"$input")"
  cwd="$(jq -r '.cwd // empty' <<<"$input")"
fi
project="${cwd:t}"
branch="$(git -C "${cwd:-.}" branch --show-current 2>/dev/null)"

text="*${project:-claude}*${branch:+ \`$branch\`}: $message"
if [[ -z "$url" ]]; then
  # Written under a temp name and renamed, so a reader never sees half a file
  name="$(date +%s)-$$.json"
  {
    mkdir -p "$spool" &&
      jq -nc --arg text "$text" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{text: $text, at: $at}' > "$spool/.$name.tmp" &&
      mv -f "$spool/.$name.tmp" "$spool/$name"
  } 2>/dev/null
  exit 0
fi
body="$(jq -nc --arg text "$text" '{text: $text}')"
if [[ -n "${AGENT_QUEUE_CURL_CMD:-}" ]]; then
  print -r -- "$body" | eval "$AGENT_QUEUE_CURL_CMD" >/dev/null 2>&1
else
  print -r -- "$body" |
    curl -sS -m 5 -X POST -H 'Content-Type: application/json' --data @- "$url" >/dev/null 2>&1
fi

exit 0

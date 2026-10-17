#!/bin/zsh
# Posts a queue notice to Slack. Reads {message, cwd} as JSON on stdin; the webhook comes from
# SLACK_WEBHOOK_URL, CLAUDE_SLACK_WEBHOOK or ~/.claude/slack-webhook, and without one it is a
# silent no-op. AGENT_QUEUE_CURL_CMD replaces the curl call in specs (JSON body on stdin).

url="${SLACK_WEBHOOK_URL:-${CLAUDE_SLACK_WEBHOOK:-}}"
[[ -z "$url" && -r "$HOME/.claude/slack-webhook" ]] && url="$(tr -d '[:space:]' < "$HOME/.claude/slack-webhook")"
[[ -z "$url" ]] && exit 0

input="$(cat)"
message="$(jq -r '.message // "Claude needs your attention"' <<<"$input")"
cwd="$(jq -r '.cwd // empty' <<<"$input")"
project="${cwd:t}"
branch="$(git -C "${cwd:-.}" branch --show-current 2>/dev/null)"

text="*${project:-claude}*${branch:+ \`$branch\`}: $message"
body="$(jq -nc --arg text "$text" '{text: $text}')"
if [[ -n "${AGENT_QUEUE_CURL_CMD:-}" ]]; then
  print -r -- "$body" | eval "$AGENT_QUEUE_CURL_CMD" >/dev/null 2>&1
else
  print -r -- "$body" |
    curl -sS -m 5 -X POST -H 'Content-Type: application/json' --data @- "$url" >/dev/null 2>&1
fi

exit 0

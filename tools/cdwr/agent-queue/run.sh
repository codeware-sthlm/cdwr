#!/bin/zsh
# Scheduled plan-only /work-queue run for the cdwr repo.
# Claude may read the repo and write plans and comments to Linear; nothing else.
# --tools removes Write, Edit and Bash outright; dontAsk denies any MCP tool not listed.
# Project MCP servers (linear, sentry via infisical production) never start, and other
# connectors are denied by name, so local allow rules can't widen the run. Add new
# connectors to --disallowedTools when they appear.
#   run.sh          normal run (launchd)
#   run.sh --check  print the decision, start nothing
# `cdwr agent install` copies this file out of the repo and sets PATH, AGENT_QUEUE_HOME and
# AGENT_QUEUE_REPO in the launchd job; a merge changes nothing until the next install.
set -euo pipefail

# Max subscription only: never let an API key or a cloud provider take over billing.
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX

HOME_DIR="${AGENT_QUEUE_HOME:?set by cdwr agent install}"
REPO="${AGENT_QUEUE_REPO:?set by cdwr agent install}"
# API-equivalent cost cap per run; on Max it guards the usage allowance, nothing is billed.
BUDGET_USD="${AGENT_QUEUE_BUDGET_USD:-5}"
OTHER_REPOS='["nx-plugins","enjinex"]'
LOGS="$HOME_DIR/logs"
mkdir -p "$LOGS"

note() { print -r -- "$(date '+%F %T') $*" >> "$LOGS/scheduler.log"; }
say() { note "$*"; $check && print -r -- "$*"; return 0; }
check=false; [[ "${1:-}" == "--check" ]] && check=true

if [[ -e "$HOME_DIR/paused" ]] && ! $check; then exit 0; fi
if ! mkdir "$HOME_DIR/lock" 2>/dev/null; then say "busy: a run is in progress"; exit 0; fi
trap 'rmdir "$HOME_DIR/lock" 2>/dev/null' EXIT

key="$(security find-generic-password -s linear-agent-queue -w 2>/dev/null || true)"
[[ -z "$key" ]] && { say "skip: no Linear API key in Keychain (service linear-agent-queue)"; exit 0; }

read -r -d '' QUERY <<'GQL' || true
query {
  issues(first: 50, filter: {
    team: { key: { eq: "COD" } }
    state: { type: { nin: ["completed", "canceled"] } }
    labels: { some: { name: { eq: "agent:ready" } } }
  }) {
    nodes {
      identifier
      labels { nodes { name } }
      inverseRelations { nodes { type issue { state { type } } } }
    }
  }
}
GQL

resp="$(jq -n --arg q "$QUERY" '{query: $q}' |
  curl -sS -m 20 https://api.linear.app/graphql \
    -H "Authorization: $key" -H 'Content-Type: application/json' --data @-)" ||
  { say "skip: Linear did not answer"; exit 0; }
if jq -e '.errors' >/dev/null <<<"$resp"; then
  say "skip: Linear error $(jq -c '.errors[0].message' <<<"$resp")"; exit 0
fi

# Plan-only: an agent:ready ticket for this repo, not blocked by an open ticket.
ready="$(jq -r --argjson other "$OTHER_REPOS" '
  .data.issues.nodes[]
  | select((.labels.nodes | map(.name | IN($other[])) | any) | not)
  | select([.inverseRelations.nodes[] | select(.type == "blocks" and (.issue.state.type | IN("completed","canceled") | not))] | length == 0)
  | .identifier' <<<"$resp")"

if [[ -z "$ready" ]]; then $check && echo "idle: nothing to plan"; exit 0; fi
if $check; then echo "would plan one of: $(print -r -- "$ready" | tr '\n' ' ')"; exit 0; fi

cd "$REPO"
git fetch -q origin
git switch -q --detach origin/main 2>/dev/null || note "warn: worktree not clean, planning against its current state"

log="$LOGS/$(date +%F_%H%M).log"
note "plan: $(print -r -- "$ready" | tr '\n' ' ')→ $log"

L=mcp__claude_ai_Linear
claude -p "/work-queue unattended once plan-only" \
  --model opus \
  --settings '{"disabledMcpjsonServers":["linear","sentry"]}' \
  --disallowedTools mcp__linear mcp__sentry mcp__claude_ai_Sentry mcp__claude_ai_Supabase mcp__claude_ai_Claude_Docs \
  --tools "Read,Grep,Glob,Skill" \
  --permission-mode dontAsk \
  --permission-prompts none \
  --max-budget-usd "$BUDGET_USD" \
  --allowedTools \
    Skill Read Grep Glob \
    "$L"__list_issues "$L"__get_issue "$L"__list_comments "$L"__list_issue_labels \
    "$L"__save_issue "$L"__save_comment \
  > "$log" 2>&1 || note "fail: claude exited $? (see $log)"

note "done: $log"

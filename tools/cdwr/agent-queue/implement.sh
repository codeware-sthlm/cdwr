#!/bin/zsh
# Scheduled implement-only /work-queue session for the cdwr repo, started by run.sh when approved
# work waits and no session is alive (watch.jq `launch`). It resumes approved or answered work
# only; it never approves a plan and never claims a new ticket.
# Deny by default: dontAsk denies anything not listed. Edit and Write reach only the ticket
# worktrees beside the agent worktree. No `cd`: a `cd … && git …` compound always prompts, which
# dontAsk turns into a denial, so the skill uses `git -C` and `pnpm -C … exec` in this mode.
# It runs from $AGENT_QUEUE_REPO; a planning run may move that checkout forward to a newer
# origin/main under it, which is accepted.
# On GitHub it acts as the codeware-agent app (github-app.sh beside this script), never as
# Håkan, whose release team bypasses main's rulesets. No app identity, no session.
#   implement.sh <key>   started by run.sh with nohup; <key> is the launch key, for the records
set -euo pipefail

# Max subscription only: never let an API key or a cloud provider take over billing.
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX

HOME_DIR="${AGENT_QUEUE_HOME:?set by cdwr agent install}"
REPO="${AGENT_QUEUE_REPO:?set by cdwr agent install}"
# API-equivalent cost cap per session; on Max it guards the usage allowance, nothing is billed.
BUDGET_USD="${AGENT_QUEUE_IMPLEMENT_BUDGET_USD:-15}"
KEY="${1:-}"
TICKET="${KEY%% *}"
LOGS="$HOME_DIR/logs"
mkdir -p "$LOGS"

note() { print -r -- "$(date '+%F %T') implement: $*" >> "$LOGS/scheduler.log"; }
notify() {
  local hook="$HOME_DIR/notify.sh"
  [[ -x "$hook" ]] || hook="$HOME/.claude/hooks/notify-slack.sh"
  [[ -x "$hook" ]] || return 0
  jq -n --arg m "$1" --arg c "$REPO" '{message: $m, cwd: $c}' | "$hook" || true
}
# The same rows run.sh writes, so the runs document shows launches too
record() {
  jq -nc --arg w "$(date '+%F %H:%M')" --arg o "$1" --arg t "$TICKET" --arg d "${2:-}" \
    '{when: $w, outcome: $o, ticket: $t, detail: $d}' >> "$HOME_DIR/runs.jsonl" 2>/dev/null || true
}

# One session at a time; run.sh reads this lock as `locked`. It holds this script's pid, so
# run.sh clears it only when its owner is gone, and only the owner removes it.
LOCK="$HOME_DIR/implement.lock"
if ! mkdir "$LOCK" 2>/dev/null; then note "busy: a session is running"; exit 0; fi
print -r -- "$$" > "$LOCK/pid"
trap '[[ "$(cat "$LOCK/pid" 2>/dev/null)" == "$$" ]] && rm -rf "$LOCK"' EXIT

# The app identity, read from the agent checkout's tools/cdwr/.env (install refreshes that
# copy). It fails closed, with the reason on stderr, and comes before the reservation so a
# session that never starts costs nothing.
source "${0:A:h}/github-app.sh"
errf="$LOGS/github-app.err"
if ! { app_env "$REPO/tools/cdwr/.env" && app_session; } 2> "$errf"; then
  reason="$(tr '\n' ' ' < "$errf" | sed 's/ *$//')"
  rm -f "$errf"
  note "fail: $reason; not starting"
  notify "Agent queue: nothing launched for $TICKET. $reason."
  record failed "$KEY · $reason"
  exit 1
fi
rm -f "$errf"

# Reserve the whole budget before the session starts, so a machine that dies mid-session still
# counts it against the daily cap; the actual cost settles it afterwards. No reservation, no start.
ledger() {
  jq -nc --arg day "$(date +%F)" --arg t "$TICKET" --argjson c "$1" --arg k "$2" \
    '{day: $day, ticket: $t, cost: $c, kind: $k}' >> "$HOME_DIR/implement-spend.jsonl"
}
if ! ledger "$BUDGET_USD" reserve 2>/dev/null; then
  note "fail: could not reserve the budget in the spend ledger; not starting"
  record failed "$KEY · spend ledger not writable"
  exit 1
fi

cd "$REPO"
log="$LOGS/implement_$(date +%F_%H%M).log"
result="${log%.log}.json"
note "launch: $KEY → $log"
record launched "$KEY · log $log"

L=mcp__claude_ai_Linear
# Escapes from the allow list below, denied first (deny wins). git config and -c run any
# command through a pager, an ssh command or an alias; nx exec runs anything; a REST write or
# a GraphQL mutation outside the thread replies could merge, push to main or drop protection.
# A force push without a lease, or one to main, is the skill's to never do. GitHub's branch
# rules still refuse a direct push to main; this keeps the session from trying.
DENY=(
  "Bash(git -c *)" "Bash(git -C * -c *)" "Bash(git * config *)" "Bash(git * --config-env*)"
  "Bash(git * push * main)" "Bash(git * push * main *)" "Bash(git * push *:main*)"
  "Bash(git * push * --force)" "Bash(git * push * --force *)" "Bash(git * push * -f)" "Bash(git * push * -f *)"
  "Bash(pnpm nx exec*)" "Bash(pnpm * nx exec*)"
  "Bash(gh pr merge*)" "Bash(gh pr close*)" "Bash(gh pr ready*)"
  # REST reads only; GraphQL goes through gh-review.sh, never raw
  "Bash(gh api graphql*)" "Bash(gh api * -X *)" "Bash(gh api * --method *)"
  "Bash(gh api * -f *)" "Bash(gh api * -F *)" "Bash(gh api * --field *)" "Bash(gh api * --raw-field *)"
  "Bash(gh api * --input*)" "Bash(gh api *@*)"
)
# The ticket worktrees sit beside the agent worktree; `//` anchors the rule at the root
WT="/${REPO:h}/codeware-cod-*/**"
rc=0
claude_pid=
# A stop (the container shutting down) reaches claude; the ledger and the lock are settled below
trap '[[ -n "$claude_pid" ]] && kill -TERM $claude_pid 2>/dev/null' TERM INT
ENABLE_TOOL_SEARCH=false claude -p "/work-queue implement-only once" \
  --model opus \
  --settings '{"disabledMcpjsonServers":["linear","sentry"]}' \
  --disallowedTools mcp__linear mcp__sentry mcp__claude_ai_Sentry mcp__claude_ai_Supabase mcp__claude_ai_Claude_Docs \
    "${DENY[@]}" \
  --permission-mode dontAsk \
  --permission-prompts none \
  --max-budget-usd "$BUDGET_USD" \
  --output-format json \
  --allowedTools \
    Skill Read Grep Glob Agent \
    "Edit($WT)" "Write($WT)" \
    "Bash(git *)" "Bash(gh pr *)" "Bash(gh api repos/codeware-sthlm/cdwr/*)" \
    "Bash(tools/cdwr/agent-queue/gh-review.sh *)" "Bash(tools/cdwr/agent-queue/linear-upload.sh *)" \
    "Bash(pnpm nx *)" "Bash(pnpm -C * nx *)" "Bash(pnpm -C * vitest *)" "Bash(pnpm -C * install*)" \
    "Bash(pnpm cdwr agent worktree *)" \
    "Bash(jq *)" "Bash(uuidgen*)" "Bash(cut *)" "Bash(date *)" "Bash(wc -c *)" \
    "Bash(tools/cdwr/agent-queue/session.sh register)" "Bash(tools/cdwr/agent-queue/session.sh ticket *)" \
    "Bash(tools/cdwr/agent-queue/wait.sh*)" \
    "Bash(tools/cdwr/agent-queue/notify.sh)" "Bash(~/.claude/hooks/notify-slack.sh)" "Bash($HOME/.claude/hooks/notify-slack.sh)" \
    "$L"__list_issues "$L"__get_issue "$L"__list_comments "$L"__list_issue_labels \
    "$L"__save_issue "$L"__save_comment "$L"__prepare_attachment_upload "$L"__create_attachment_from_upload \
  > "$result" 2> "$log" &
claude_pid=$!
wait $claude_pid || rc=$?
# wait returns early on a trapped signal; let claude finish
kill -0 $claude_pid 2>/dev/null && { wait $claude_pid || rc=$?; }
claude_pid=

jq -r '.result // empty, (.errors // [])[]' "$result" >> "$log" 2>/dev/null || cat "$result" >> "$log"
cost="$(jq -r '.total_cost_usd // empty' "$result" 2>/dev/null || true)"
# No result (a crash or a kill) keeps the full reservation, so failing launches still meet the cap
[[ "$cost" == <->(|.<->) ]] || cost="$BUDGET_USD"
# Settle the reservation to the actual cost. The daily cap reads this ledger, not the hourly usage
# document, so two launches can't slip through.
settle="$(jq -n --argjson c "$cost" --argjson b "$BUDGET_USD" '$c - $b')"
[[ "$settle" == 0 ]] || ledger "$settle" settle 2>/dev/null || note "warn: could not settle the spend ledger"
spent=" · \$$(printf '%.2f' "$cost") in $(jq -r '.num_turns // "?"' "$result" 2>/dev/null) turns"

if (( rc == 0 )); then
  note "done: $KEY$spent"
  record implemented "$KEY$spent · log $log"
elif [[ "$(jq -r '.subtype // empty' "$result" 2>/dev/null)" == error_max_budget_usd ]]; then
  note "cap: stopped at the \$$BUDGET_USD budget (see $log)"
  notify "Agent queue: an implementing session on $TICKET hit the \$$BUDGET_USD cap and stopped. Log: $log"
  record cap "$KEY · stopped at the \$$BUDGET_USD budget, log $log"
else
  note "fail: claude exited $rc (see $log)"
  notify "Agent queue: an implementing session on $TICKET failed (exit $rc). Log: $log"
  record failed "$KEY · claude exited $rc, log $log$spent"
fi

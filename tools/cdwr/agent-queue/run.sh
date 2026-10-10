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
# Always action-level: a run that planned something or went wrong needs Håkan. No webhook, no-op.
notify() {
  local hook="$HOME/.claude/hooks/notify-slack.sh"
  [[ -x "$hook" ]] || return 0
  jq -n --arg m "$1" --arg c "$REPO" '{message: $m, cwd: $c}' | "$hook" || true
}
# notice <action|info> <message>: info is dropped when notify-level says action.
notice() {
  local level; level="$(tr -d '[:space:]' 2>/dev/null < "$HOME_DIR/notify-level" || true)"
  [[ "$1" == info && "$level" == action ]] && return 0
  notify "$2"
}
check=false; [[ "${1:-}" == "--check" ]] && check=true

# Run history for the "Agent queue: runs" Linear document, newest last. Idle adds no row.
RUNS="$HOME_DIR/runs.jsonl"
last_outcome=idle
# Rows at the start; watch_prs records from a subshell, so a flag would miss its rows
rows() { [[ -f "$RUNS" ]] && wc -l < "$RUNS" | tr -d ' ' || print 0; }
rows_at_start="$(rows)"
# record <outcome> [ticket] [detail]: a warn is a row, never the run's outcome.
record() {
  $check && return 0
  [[ "$1" == warn ]] || last_outcome="$1${2:+ $2}"
  jq -nc --arg w "$(date '+%F %H:%M')" --arg o "$1" --arg t "${2:-}" --arg d "${3:-}" \
    '{when: $w, outcome: $o, ticket: $t, detail: $d}' >> "$RUNS" 2>/dev/null || true
}

if [[ -e "$HOME_DIR/paused" ]] && ! $check; then exit 0; fi
if ! mkdir "$HOME_DIR/lock" 2>/dev/null; then say "busy: a run is in progress"; exit 0; fi
trap 'rmdir "$HOME_DIR/lock" 2>/dev/null' EXIT

key="$(security find-generic-password -s linear-agent-queue -w 2>/dev/null || true)"
[[ -z "$key" ]] && { say "skip: no Linear API key in Keychain (service linear-agent-queue)"; exit 0; }

# linear <query> [variables as JSON]
linear() {
  local vars="${2:-}"; [[ -z "$vars" ]] && vars='{}'
  jq -n --arg q "$1" --argjson v "$vars" '{query: $q, variables: $v}' |
    curl -sS -m 20 https://api.linear.app/graphql \
      -H "Authorization: $key" -H 'Content-Type: application/json' --data @-
}

# The only writes run.sh makes: the runs, usage and activity documents, each created once
# on the Codeware team and then updated in place.
DOC_TITLE='Agent queue: runs'
USAGE_TITLE='Agent queue: usage'
ACTIVITY_TITLE='Agent queue: activity'
read -r -d '' DOC_FIND <<'GQL' || true
query($title: String!) {
  documents(first: 1, filter: { title: { eq: $title } }) { nodes { id } }
  teams(filter: { key: { eq: "COD" } }) { nodes { id } }
}
GQL
read -r -d '' DOC_CREATE <<'GQL' || true
mutation($team: String!, $title: String!, $content: String!) {
  documentCreate(input: { teamId: $team, title: $title, content: $content }) { document { id } }
}
GQL
read -r -d '' DOC_UPDATE <<'GQL' || true
mutation($id: String!, $content: String!) {
  documentUpdate(id: $id, input: { content: $content }) { success }
}
GQL

# Job state for the runs document: the interval launchd uses and whether the installed copy
# matches origin/main. Keep INTERVAL_SED in step with the line in agent.logic.ts.
PLIST="$HOME/Library/LaunchAgents/se.codeware.agent-queue.plist"
INTERVAL_SED='s/^export const RUN_INTERVAL_SECONDS = \([0-9][0-9]*\);$/\1/p'
job_line() {
  setopt local_options no_err_exit
  local dir=tools/cdwr/agent-queue secs want theirs f out
  local -a differs
  secs="$(plutil -extract StartInterval raw -o - "$PLIST" 2>/dev/null)"
  if [[ "$secs" == <-> ]]; then out="Job: every $(( secs / 60 )) min"; else out="Job: interval unknown"; fi
  want="$(git -C "$REPO" show origin/main:tools/cdwr/src/commands/agent/agent.logic.ts 2>/dev/null | sed -n "$INTERVAL_SED")"
  if [[ -z "$want" ]]; then print -r -- "$out · install unknown"; return 0; fi
  for f in run.sh watch.jq; do
    theirs="$(git -C "$REPO" show "origin/main:$dir/$f" 2>/dev/null)" ||
      { print -r -- "$out · install unknown"; return 0; }
    [[ "$(cat "$HOME_DIR/$f" 2>/dev/null)" == "$theirs" ]] || differs+=("$f")
  done
  [[ "$secs" == "$want" ]] || differs+=(interval)
  if (( ${#differs} )); then print -r -- "$out · install out of date (${(j:, :)differs})"
  else print -r -- "$out · install current"; fi
}

# Rewrites the whole document from runs.jsonl; a failure is a warn line, never a stop.
# A run that recorded nothing publishes only when the last publish is over an hour old.
publish_runs() {
  $check && return 0
  setopt local_options no_err_exit
  local stamp="$HOME_DIR/runs-published-at" last=0 content
  if (( $(rows) <= rows_at_start )); then
    last="$(cat "$stamp" 2>/dev/null)"
    [[ "$last" == <-> ]] || last=0
    (( $(date +%s) - last > 3600 )) || return 0
  fi
  [[ -f "$RUNS" ]] && tail -n 20 "$RUNS" > "$RUNS.tmp" && mv "$RUNS.tmp" "$RUNS"
  content="$({ [[ -f "$RUNS" ]] && cat "$RUNS"; true; } | jq -rs --arg last "$(date '+%F %H:%M') · $last_outcome" --arg job "$(job_line)" '
    def cell: tostring | gsub("\\|"; "\\|") | gsub("\n"; " ");
    "Last run: \($last)\n\n\($job)\n\nWritten by the agent queue scheduler after every run. Idle runs update the lines above at most once an hour.\n\n"
    + "| When | Outcome | Ticket | Detail |\n| -- | -- | -- | -- |\n"
    + (reverse | map("| \(.when | cell) | \(.outcome | cell) | \(.ticket | cell) | \(.detail | cell) |") | join("\n"))
  ')" || { note "warn: runs document: could not render"; return 0; }
  publish_doc "$DOC_TITLE" "$HOME_DIR/runs-doc-id" "$stamp" "$content"
}

# The usage document from `cdwr agent usage`, at most once an hour. The CLI runs from $REPO,
# which follows origin/main, so it needs that checkout's install; when it can't start, that
# is a warn row. Only numbers, model names and ticket ids leave the machine.
publish_usage() {
  $check && return 0
  setopt local_options no_err_exit
  local stamp="$HOME_DIR/usage-published-at" last content
  last="$(cat "$stamp" 2>/dev/null)"
  [[ "$last" == <-> ]] || last=0
  (( $(date +%s) - last > 3600 )) || return 0
  content="$(cd "$REPO" && node tools/cdwr/bin/cdwr.mjs agent usage --days 30 --json 2>/dev/null </dev/null |
    jq -er '.result.document')" || {
    # Stamped all the same, so a broken install warns once an hour, not every run
    date +%s > "$stamp"
    note "warn: usage document: cdwr agent usage failed"; record warn "" "usage: cdwr agent usage failed"; return 0
  }
  publish_doc "$USAGE_TITLE" "$HOME_DIR/usage-doc-id" "$stamp" "$content"
}

# The activity document from Linear's issue history and runs.jsonl, rendered by
# `cdwr agent activity` (same install caveat as usage). Every run reads Linear, but publishes
# only when something below the "Updated:" line changed, so idle runs leave it alone.
read -r -d '' ACTIVITY_QUERY <<'GQL' || true
query {
  issues(first: 30, filter: {
    team: { key: { eq: "COD" } }
    updatedAt: { gt: "-P7D" }
    labels: { some: { name: { startsWith: "agent:" } } }
  }) {
    nodes {
      identifier
      history(first: 100) {
        nodes {
          createdAt actor { name } botActor { name type }
          fromState { name } toState { name }
          addedLabels { name } removedLabels { name } updatedDescription
        }
      }
      comments(first: 50) { nodes { createdAt body user { name } botActor { name type } } }
    }
  }
}
GQL
# A warn row at most once an hour, so a lasting failure can't push real rows out of runs.jsonl
activity_warn() {
  local stamp="$HOME_DIR/activity-warned-at" last
  note "warn: activity document: $1"
  last="$(cat "$stamp" 2>/dev/null)"
  [[ "$last" == <-> ]] || last=0
  (( $(date +%s) - last > 3600 )) || return 0
  date +%s > "$stamp"
  record warn "" "activity: $1"
}
publish_activity() {
  $check && return 0
  setopt local_options no_err_exit
  local stamp="$HOME_DIR/activity-published-at" hashfile="$HOME_DIR/activity-hash" resp content hash before
  resp="$(linear "$ACTIVITY_QUERY")"
  if ! jq -e '.data.issues.nodes' >/dev/null <<<"$resp" 2>/dev/null; then
    activity_warn "Linear error $(jq -c '.errors[0].message' <<<"$resp" 2>/dev/null)"; return 0
  fi
  content="$(cd "$REPO" && node tools/cdwr/bin/cdwr.mjs agent activity --runs "$RUNS" --json 2>/dev/null <<<"$resp" |
    jq -er '.result.document')" || { activity_warn "cdwr agent activity failed"; return 0; }
  hash="$(print -r -- "$content" | sed 1d | shasum | cut -d' ' -f1)"
  [[ "$hash" == "$(cat "$hashfile" 2>/dev/null)" ]] && return 0
  before="$(cat "$stamp" 2>/dev/null)"
  publish_doc "$ACTIVITY_TITLE" "$HOME_DIR/activity-doc-id" "$stamp" "$content"
  # publish_doc stamps only a publish that went through
  [[ "$(cat "$stamp" 2>/dev/null)" != "$before" ]] && print -r -- "$hash" > "$hashfile"
  return 0
}

# publish_doc <title> <id file> <stamp file> <content>: finds the document by title or
# creates it, then rewrites it. A failure is a warn line, never a stop.
publish_doc() {
  setopt local_options no_err_exit
  local title=$1 file=$2 stamp=$3 content=$4 id resp team
  id="$(cat "$file" 2>/dev/null)"
  if [[ -z "$id" ]]; then
    resp="$(linear "$DOC_FIND" "$(jq -nc --arg t "$title" '{title: $t}')")"
    id="$(jq -r '.data.documents.nodes[0].id // empty' <<<"$resp" 2>/dev/null)"
    if [[ -z "$id" ]]; then
      team="$(jq -r '.data.teams.nodes[0].id // empty' <<<"$resp" 2>/dev/null)"
      [[ -z "$team" ]] && { note "warn: $title: no Codeware team from Linear"; return 0; }
      resp="$(linear "$DOC_CREATE" "$(jq -nc --arg team "$team" --arg t "$title" --arg c "$content" \
        '{team: $team, title: $t, content: $c}')")"
      id="$(jq -r '.data.documentCreate.document.id // empty' <<<"$resp" 2>/dev/null)"
      [[ -z "$id" ]] && { note "warn: $title: create failed $(jq -c '.errors[0].message' <<<"$resp" 2>/dev/null)"; return 0; }
      print -r -- "$id" > "$file"
      date +%s > "$stamp"
      return 0
    fi
    print -r -- "$id" > "$file"
  fi

  resp="$(linear "$DOC_UPDATE" "$(jq -nc --arg id "$id" --arg c "$content" '{id: $id, content: $c}')")"
  if ! jq -e '.data.documentUpdate.success' >/dev/null <<<"$resp" 2>/dev/null; then
    # A deleted document is found or created again next run
    rm -f "$file"
    note "warn: $title: update failed $(jq -c '.errors[0].message' <<<"$resp" 2>/dev/null)"
  else
    date +%s > "$stamp"
  fi
}
# Every handled outcome exits 0, so a non-zero exit is a failure nothing recorded.
on_exit() {
  local st=$1
  if (( st != 0 )); then
    note "fail: run.sh exited $st"
    record failed "" "run.sh exited $st, see scheduler.log"
  fi
  # Usage and activity first: their warn rows belong in this run's runs document
  publish_usage
  publish_activity
  publish_runs
  rmdir "$HOME_DIR/lock" 2>/dev/null
  return 0
}
trap 'st=$?; on_exit $st; exit $st' EXIT

# PR watch: gh runs as Håkan, so only reads (gh pr list, gh api graphql with a query).
# The decisions live in watch.jq, installed next to this file.
read -r -d '' WATCHED <<'GQL' || true
query {
  issues(first: 50, filter: {
    team: { key: { eq: "COD" } }
    labels: { some: { name: { eq: "agent:review" } } }
    state: { type: { neq: "canceled" } }
    or: [{ completedAt: { null: true } }, { completedAt: { gt: "-P14D" } }]
  }) {
    nodes {
      identifier
      labels { nodes { name } }
      attachments { nodes { url createdAt } }
      comments(first: 50, orderBy: createdAt) { nodes { body createdAt } }
    }
  }
}
GQL
read -r -d '' PR_QUERY <<'GQL' || true
query($n: Int!) {
  repository(owner: "codeware-sthlm", name: "cdwr") {
    pullRequest(number: $n) {
      state
      mergeQueueEntry { state }
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      timelineItems(last: 1, itemTypes: [REMOVED_FROM_MERGE_QUEUE_EVENT]) {
        nodes { ... on RemovedFromMergeQueueEvent { reason createdAt } }
      }
    }
  }
}
GQL

watch() { jq -L "$HOME_DIR" "$@"; }

watch_prs() {
  # One PR failing to read skips that PR, not the rest.
  setopt local_options no_err_exit
  local file="$HOME_DIR/watch.json" resp nodes state node id pr now out level msg
  resp="$(linear "$WATCHED")" || { print -r -- "Linear did not answer"; return 1; }
  jq -e '.data.issues.nodes' >/dev/null <<<"$resp" 2>/dev/null ||
    { print -r -- "Linear error $(jq -c '.errors[0].message' <<<"$resp" 2>/dev/null)"; return 1; }
  # Same repo rule as planning: tickets labelled for another repo have no PR here.
  nodes="$(jq -c --argjson other "$OTHER_REPOS" '[.data.issues.nodes[]
    | select((.labels.nodes | map(.name | IN($other[])) | any) | not)]' <<<"$resp")"
  # A missing or broken state file counts as empty; tickets no longer watched drop out.
  state="$(jq -c 'if type == "object" then . else {} end' "$file" 2>/dev/null || print '{}')"
  state="$(watch -c --argjson ids "$(jq -c 'map(.identifier)' <<<"$nodes")" \
    'include "watch"; prune($ids)' <<<"$state")" || { print -r -- "watch.jq failed"; return 1; }

  for node in ${(f)"$(jq -c '.[]' <<<"$nodes")"}; do
    id="$(jq -r '.identifier' <<<"$node")"
    pr="$(watch 'include "watch"; pr_number // empty' <<<"$node")"
    if [[ -z "$pr" ]]; then
      pr="$(gh pr list --repo codeware-sthlm/cdwr --state all --search "\"$id\" in:title,body" \
        --json number --limit 1 --jq '.[0].number // empty')" || { note "warn: watch: no PR lookup for $id"; record warn "$id" "watch: no PR lookup"; continue; }
    fi
    [[ -z "$pr" ]] && continue
    now="$(gh api graphql -f query="$PR_QUERY" -F n="$pr" --jq '.data.repository.pullRequest')"
    if [[ $? -ne 0 || -z "$now" || "$now" == null ]]; then
      note "warn: watch: could not read PR #$pr ($id)"; record warn "$id" "watch: could not read PR #$pr"; continue
    fi
    out="$(watch -cn --arg id "$id" --argjson pr "$pr" --argjson node "$node" --argjson now "$now" \
      --argjson state "$state" --arg at "$(date -u +%FT%TZ)" '
      include "watch";
      {id: $id, pr: $pr, now: ($now | pr_state), prev: $state[$id], handoffs: ($node | handoffs), at: $at} | step')" ||
      { note "warn: watch: watch.jq failed on $id"; record warn "$id" "watch: watch.jq failed"; continue; }
    while IFS=$'\t' read -r level msg; do
      [[ -z "$level" ]] && continue
      note "watch: $level $msg"
      notice "$level" "$msg"
    done <<<"$(jq -r '.notices[] | "\(.level)\t\(.message)"' <<<"$out")"
    state="$(jq -c --arg id "$id" --argjson e "$(jq -c '.entry' <<<"$out")" '.[$id] = $e' <<<"$state")"
  done

  print -r -- "$state" > "$file.tmp" && mv "$file.tmp" "$file"
}

# One fetch per run: the job line and planning both read origin/main. A failure never stops the run.
if ! $check; then
  git -C "$REPO" fetch -q origin 2>/dev/null || note "warn: fetch failed"
fi

# Watching sends notices, so --check leaves it out; a failure never stops planning.
if ! $check; then
  err="$(watch_prs)" || { note "warn: watch failed (${err:-unknown})"; record warn "" "watch failed: ${err:-unknown}"; }
fi

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

resp="$(linear "$QUERY")" ||
  { say "skip: Linear did not answer"; record skip "" "Linear did not answer"; exit 0; }
if jq -e '.errors' >/dev/null <<<"$resp"; then
  say "skip: Linear error $(jq -c '.errors[0].message' <<<"$resp")"
  record skip "" "Linear error $(jq -c '.errors[0].message' <<<"$resp")"; exit 0
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
git switch -q --detach origin/main 2>/dev/null ||
  { note "warn: worktree not clean, planning against its current state"; record warn "" "worktree not clean"; }

log="$LOGS/$(date +%F_%H%M).log"
result="${log%.log}.json"
note "plan: $(print -r -- "$ready" | tr '\n' ' ')→ $log"

L=mcp__claude_ai_Linear
rc=0
# Tool search would defer the Linear tools behind ToolSearch, which --tools leaves out.
ENABLE_TOOL_SEARCH=false claude -p "/work-queue unattended once plan-only" \
  --model opus \
  --settings '{"disabledMcpjsonServers":["linear","sentry"]}' \
  --disallowedTools mcp__linear mcp__sentry mcp__claude_ai_Sentry mcp__claude_ai_Supabase mcp__claude_ai_Claude_Docs \
  --tools "Read,Grep,Glob,Skill" \
  --permission-mode dontAsk \
  --permission-prompts none \
  --max-budget-usd "$BUDGET_USD" \
  --output-format json \
  --allowedTools \
    Skill Read Grep Glob \
    "$L"__list_issues "$L"__get_issue "$L"__list_comments "$L"__list_issue_labels \
    "$L"__save_issue "$L"__save_comment \
  > "$result" 2> "$log" || rc=$?

# The JSON carries the run's own cost; the log keeps the readable result.
jq -r '.result // empty, (.errors // [])[]' "$result" >> "$log" 2>/dev/null || cat "$result" >> "$log"
cost="$(jq -r '.total_cost_usd // empty' "$result" 2>/dev/null || true)"
spent=""; [[ "$cost" == <->(|.<->) ]] && spent=" · \$$(printf '%.2f' "$cost") in $(jq -r '.num_turns // "?"' "$result") turns"

if (( rc != 0 )); then
  if [[ "$(jq -r '.subtype // empty' "$result" 2>/dev/null)" == error_max_budget_usd ]]; then
    note "cap: stopped at the \$$BUDGET_USD budget (see $log)"
    notify "Agent queue: a planning run hit the \$$BUDGET_USD cap and stopped. Log: $log"
    record cap "" "stopped at the \$$BUDGET_USD budget, log $log"
  else
    note "fail: claude exited $rc (see $log)"
    notify "Agent queue: a planning run failed (exit $rc). Log: $log"
    record failed "" "claude exited $rc, log $log$spent"
  fi
fi

# A ticket offered as agent:ready that now waits on needs-input was planned by this run.
read -r -d '' PLANNED <<'GQL' || true
query {
  issues(first: 50, filter: {
    team: { key: { eq: "COD" } }
    labels: { some: { name: { eq: "agent:needs-input" } } }
  }) { nodes { identifier } }
}
GQL
if after="$(linear "$PLANNED")" && ! jq -e '.errors' >/dev/null <<<"$after"; then
  planned=0
  for id in $(jq -r --arg ready "$ready" '
      ($ready | split("\n")) as $offered
      | .data.issues.nodes[].identifier | select(IN($offered[]))' <<<"$after" 2>/dev/null); do
    note "planned: $id"
    record planned "$id" "log $log$spent"
    notify "$id: plan ready, needs your approval"
    (( ++planned ))
  done
  # A clean exit that planned nothing is a failure all the same, e.g. no Linear tools.
  if (( rc == 0 && planned == 0 )); then
    note "fail: planned nothing (see $log)"
    notify "Agent queue: a planning run exited cleanly but planned nothing. Log: $log"
    record "planned nothing" "" "log $log$spent"
  fi
else
  note "warn: could not ask Linear what was planned"
  record warn "" "could not ask Linear what was planned"
fi

note "done: $log"

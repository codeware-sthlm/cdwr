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
# Budget for the daily suggest session, same reading as above.
SUGGEST_BUDGET_USD="${AGENT_QUEUE_SUGGEST_BUDGET_USD:-5}"
# Local hour after which the suggest session may run.
SUGGEST_HOUR="${AGENT_QUEUE_SUGGEST_HOUR:-6}"
# Days between suggest sessions; 0 switches the feature off.
SUGGEST_DAYS="${AGENT_QUEUE_SUGGEST_DAYS:-1}"
# The dev checkout's Claude memory directory; empty means no memory file is writable.
MEMORY_DIR="${AGENT_QUEUE_MEMORY_DIR:-}"
OTHER_REPOS='["nx-plugins","enjinex"]'
LOGS="$HOME_DIR/logs"
mkdir -p "$LOGS"

# The Suggested line of the runs document: today's date and what happened
suggested_line() { print -r -- "$(date +%F) · $*" > "$HOME_DIR/suggested-line"; }
note() { print -r -- "$(date '+%F %T') $*" >> "$LOGS/scheduler.log"; }
say() { note "$*"; $check && print -r -- "$*"; return 0; }
# Always action-level: a run that planned something or went wrong needs Håkan. No webhook, no-op.
notify() {
  local hook="$HOME_DIR/notify.sh"
  [[ -x "$hook" ]] || hook="$HOME/.claude/hooks/notify-slack.sh"
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

source "${0:A:h}/checkin.sh"
# A pause is deliberate: the tick still checks in ok, so the monitor does not alert
if [[ -e "$HOME_DIR/paused" ]] && ! $check; then checkin ok; exit 0; fi
if ! mkdir "$HOME_DIR/lock" 2>/dev/null; then say "busy: a run is in progress"; exit 0; fi
trap 'rmdir "$HOME_DIR/lock" 2>/dev/null' EXIT
CHECKIN_ID=""

source "${0:A:h}/lib.sh"
source "${0:A:h}/waits.sh"
source "${0:A:h}/github-app.sh"
[[ -z "$key" ]] && { say "skip: no Linear API key (AGENT_QUEUE_LINEAR_KEY or Keychain service linear-agent-queue)"; exit 0; }
# No network is not a Linear failure: no record, no warn rows, the next run catches up
if offline; then say "skip: offline (Mac asleep?)"; exit 0; fi

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
  local dir=tools/cdwr/agent-queue secs want theirs f out kind=install
  local -a differs
  if [[ "${AGENT_QUEUE_HOST:-}" == container ]]; then
    # The container's copies under $HOME_DIR are the baked ones
    kind=image
    secs="${RUN_INTERVAL_SECONDS:-}"
  else
    secs="$(plutil -extract StartInterval raw -o - "$PLIST" 2>/dev/null)"
  fi
  if [[ "$secs" == <-> ]]; then out="Job: every $(( secs / 60 )) min"; else out="Job: interval unknown"; fi
  want="$(git -C "$REPO" show origin/main:tools/cdwr/src/commands/agent/agent.logic.ts 2>/dev/null | sed -n "$INTERVAL_SED")"
  if [[ -z "$want" ]]; then print -r -- "$out · $kind unknown"; return 0; fi
  for f in run.sh lib.sh waits.sh watch.jq implement.sh github-app.sh notify.sh checkin.sh telemetry.sh; do
    theirs="$(git -C "$REPO" show "origin/main:$dir/$f" 2>/dev/null)" ||
      { print -r -- "$out · $kind unknown"; return 0; }
    [[ "$(cat "$HOME_DIR/$f" 2>/dev/null)" == "$theirs" ]] || differs+=("$f")
  done
  [[ "$secs" == "$want" ]] || differs+=(interval)
  if (( ${#differs} )); then print -r -- "$out · $kind out of date (${(j:, :)differs})"
  elif [[ $kind == image ]]; then print -r -- "$out · image"
  else print -r -- "$out · install current"; fi
}

# Rewrites the whole document from runs.jsonl; a failure is a warn line, never a stop.
# A run that recorded nothing publishes only when the last publish is over an hour old.
publish_runs() {
  $check && return 0
  setopt local_options no_err_exit
  local stamp="$HOME_DIR/runs-published-at" seen="$HOME_DIR/attended-published" last=0 content
  local seen_view="$HOME_DIR/queue-view-published" view_key=""
  local seen_sug="$HOME_DIR/suggested-published" sug_line
  sug_line="$(cat "$HOME_DIR/suggested-line" 2>/dev/null)"
  # The view without its timestamp and heartbeat, so an unchanged queue is no change
  [[ -n "$queue_view" ]] &&
    view_key="$(jq -c '{limit, next, held, parked, table, session: (.session | if . == null then null else {state, ticket} end)}' <<<"$queue_view" 2>/dev/null)"
  # A changed Attended or Suggested line or queue view publishes at once, so it is never more than one run old
  # (empty means no verdict this run, which is no change)
  if (( $(rows) <= rows_at_start )) &&
     [[ -z "$attended_line" || "$attended_line" == "$(cat "$seen" 2>/dev/null)" ]] &&
     [[ "$sug_line" == "$(cat "$seen_sug" 2>/dev/null)" ]] &&
     [[ -z "$view_key" || "$view_key" == "$(cat "$seen_view" 2>/dev/null)" ]]; then
    last="$(cat "$stamp" 2>/dev/null)"
    [[ "$last" == <-> ]] || last=0
    (( $(date +%s) - last > 3600 )) || return 0
  fi
  [[ -f "$RUNS" ]] && tail -n 20 "$RUNS" > "$RUNS.tmp" && mv "$RUNS.tmp" "$RUNS"
  content="$({ [[ -f "$RUNS" ]] && cat "$RUNS"; true; } | jq -rs --arg last "$(date '+%F %H:%M') · $last_outcome" --arg job "$(job_line)" --arg attended "${attended_line:-$(cat "$seen" 2>/dev/null)}" --arg suggested "$sug_line" \
    --arg view "$(jq . <<<"${queue_view:-$(cat "$HOME_DIR/queue-view.json" 2>/dev/null)}" 2>/dev/null)" '
    def cell: tostring | gsub("\\|"; "\\|") | gsub("\n"; " ");
    "Last run: \($last)\n\n"
    + (if $attended == "" then "" else "Attended: \($attended)\n\n" end)
    + (if $suggested == "" then "" else "Suggested: \($suggested)\n\n" end)
    + (if $view == "" then "" else "```json queue-view\n\($view)\n```\n\n" end)
    + "\($job)\n\nWritten by the agent queue scheduler after every run. Idle runs update the lines above at most once an hour.\n\n"
    + "| When | Outcome | Ticket | Detail |\n| -- | -- | -- | -- |\n"
    + (reverse | map("| \(.when | cell) | \(.outcome | cell) | \(.ticket | cell) | \(.detail | cell) |") | join("\n"))
  ')" || { note "warn: runs document: could not render"; return 0; }
  local before="$(cat "$stamp" 2>/dev/null)"
  publish_doc "$DOC_TITLE" "$HOME_DIR/runs-doc-id" "$stamp" "$content"
  # publish_doc tells success only by moving the stamp; a failed publish stays unseen
  [[ "$(cat "$stamp" 2>/dev/null)" != "$before" ]] || return 0
  [[ -n "$attended_line" ]] && print -r -- "$attended_line" > "$seen"
  print -r -- "$sug_line" > "$seen_sug"
  if [[ -n "$view_key" ]]; then
    print -r -- "$view_key" > "$seen_view"
    print -r -- "$queue_view" > "$HOME_DIR/queue-view.json"
  fi
  return 0
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
query($after: String) {
  issues(first: 25, after: $after, filter: {
    team: { key: { eq: "COD" } }
    updatedAt: { gt: "-P7D" }
    labels: { some: { name: { startsWith: "agent:" } } }
  }) {
    pageInfo { hasNextPage endCursor }
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
  local stamp="$HOME_DIR/activity-published-at" hashfile="$HOME_DIR/activity-hash" pages="$HOME_DIR/activity-pages.jsonl"
  local resp content hash before after=null page
  # Every page, so a ticket past the first can't hide one of the newest events; pages go
  # through a file, since all of them together can outgrow a command line.
  : > "$pages"
  for page in {1..8}; do
    resp="$(linear "$ACTIVITY_QUERY" "$(jq -nc --argjson a "$after" '{after: $a}')")"
    if ! jq -e '.data.issues.nodes' >/dev/null <<<"$resp" 2>/dev/null; then
      activity_warn "Linear error $(jq -c '.errors[0].message' <<<"$resp" 2>/dev/null)"; return 0
    fi
    jq -c '.data.issues.nodes' <<<"$resp" >> "$pages"
    [[ "$(jq -r '.data.issues.pageInfo.hasNextPage' <<<"$resp")" == true ]] || break
    after="$(jq -c '.data.issues.pageInfo.endCursor' <<<"$resp")"
    (( page == 8 )) && note "warn: activity document: more than 8 pages of tickets, the rest left out"
  done
  resp="$(jq -cs '{data: {issues: {nodes: add}}}' "$pages")"
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
  rm -f "$LOGS/gh-read-fallback.$$"
  if (( st != 0 )); then
    note "fail: run.sh exited $st"
    record failed "" "run.sh exited $st, see scheduler.log"
  fi
  # Usage and activity first: their warn rows belong in this run's runs document
  publish_usage
  publish_activity
  publish_runs
  rmdir "$HOME_DIR/lock" 2>/dev/null
  if ! $check; then
    if (( st == 0 )); then checkin ok "$CHECKIN_ID"; else checkin error "$CHECKIN_ID"; fi
  fi
  return 0
}
trap 'st=$?; on_exit $st; exit $st' EXIT
# Opened only once on_exit can close it; earlier skips send nothing, so a missing key shows as missed check-ins
$check || CHECKIN_ID="$(checkin in_progress)"

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
      reviewThreads(first: 100) {
        nodes { isResolved comments(last: 1) { nodes { author { __typename } body } } }
      }
      timelineItems(last: 1, itemTypes: [REMOVED_FROM_MERGE_QUEUE_EVENT]) {
        nodes { ... on RemovedFromMergeQueueEvent { reason createdAt } }
      }
    }
  }
}
GQL

watch() { jq -L "$HOME_DIR" "$@"; }

# gh_identity: exports the GitHub App's token for the reads of the calling subshell, so call it
# only inside a command substitution. On failure sets gh_reason and returns 1, leaving the reads
# to the machine's own login.
gh_reason=""
gh_identity() {
  # Its own file: implement.sh writes github-app.err and may run at the same time
  local errf="$LOGS/github-app.run.$$.err"
  if { app_env "$REPO/tools/cdwr/.env" && app_token; } 2> "$errf"; then
    rm -f "$errf"; return 0
  fi
  gh_reason="$(tr '\n' ' ' < "$errf" | sed 's/ *$//')"
  rm -f "$errf"
  return 1
}
# Same, with the fallback noted; --check logs nothing
gh_identity_or_note() {
  gh_identity && return 0
  $check || note "warn: GitHub reads as the signed-in user: ${gh_reason:-no reason given}"
  return 0
}

watch_prs() {
  # One PR failing to read skips that PR, not the rest.
  setopt local_options no_err_exit
  local file="$HOME_DIR/watch.json" resp nodes state node id pr now out level msg
  gh_identity_or_note
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
      pr="$(gh_read gh pr list --repo codeware-sthlm/cdwr --state all --search "\"$id\" in:title,body" \
        --json number --limit 1 --jq '.[0].number // empty')" || { note "warn: watch: no PR lookup for $id"; record warn "$id" "watch: no PR lookup"; continue; }
    fi
    [[ -z "$pr" ]] && continue
    now="$(gh_read gh api graphql -f query="$PR_QUERY" -F n="$pr" --jq '.data.repository.pullRequest')"
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

# What an attended /work-queue session would do now, from watch.jq's `attended` (the computed
# form of the skill's "What to take next"). It reads watch.json, so it runs after the watch;
# --check uses the last run's watch.json. A failure leaves the line empty, never stops the run.
attended_line=""
queue_view=""
attended() {
  setopt local_options no_err_exit
  local resp state verdict waits
  resp="$(linear "$ATTENDED_QUERY")"
  if ! jq -e '.data.issues.nodes' >/dev/null <<<"$resp" 2>/dev/null; then
    note "warn: attended: Linear error $(jq -c '.errors[0].message' <<<"$resp" 2>/dev/null)"; return 0
  fi
  state="$(jq -c 'if type == "object" then . else {} end' "$HOME_DIR/watch.json" 2>/dev/null || print '{}')"
  # The fallback was already noted by watch_prs, so this one stays quiet
  waits="$(gh_identity || true; parked_waits <<<"$resp")"
  verdict="$(watch -c --argjson now "$(date +%s)" --argjson watch "$state" --argjson waits "$waits" \
    'include "watch"; .data.issues.nodes | attended($now; 5; $watch; $waits)' <<<"$resp")" ||
    { note "warn: attended: watch.jq failed"; return 0; }
  attended_line="$(watch -r 'include "watch"; attended_line' <<<"$verdict")"
  # Session heartbeat files, with the process checks jq can't do. Never stops the run.
  local SESSIONS="$HOME_DIR/sessions" f w pid wpid sessions_json="[]" session sstate=none
  if [[ -d "$SESSIONS" ]]; then
    local -a items=()
    for f in "$SESSIONS"/*.json(N); do
      pid="$(jq -r '.pid // empty' "$f" 2>/dev/null)"
      wpid="$(cat "${f%.json}.watcher" 2>/dev/null)"
      local pa=false wa=false remote=false fhost
      # A mirrored file from another host: its pids mean nothing here, so liveness is its age
      fhost="$(jq -r '.host // empty' "$f" 2>/dev/null)"
      [[ -n "$fhost" && "$fhost" != "$(host_id)" ]] && remote=true
      if ! $remote; then
        [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null && pa=true
        [[ "$wpid" == <-> ]] && kill -0 "$wpid" 2>/dev/null && wa=true
      fi
      # Ended or dead for over 24 h: delete
      if [[ "$pa" == false || "$(jq -r '.state' "$f" 2>/dev/null)" == ended ]] &&
         (( $(date +%s) - $(jq -r '.lastSeen // empty | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601' "$f" 2>/dev/null || echo 0) > 86400 )); then
        rm -f "$f" "${f%.json}.watcher" "${f%.json}.seen" "$f.mirrored"; continue
      fi
      if $remote; then
        items+=("$(jq -c '. + {pidAlive: null, watcherAlive: null}' "$f" 2>/dev/null)")
      else
        items+=("$(jq -c --argjson pa "$pa" --argjson wa "$wa" '. + {pidAlive: $pa, watcherAlive: $wa}' "$f" 2>/dev/null)")
      fi
    done
    # A watcher file whose pid is dead, with or without a session file
    for w in "$SESSIONS"/*.watcher(N); do
      wpid="$(cat "$w" 2>/dev/null)"
      [[ "$wpid" == <-> ]] && kill -0 "$wpid" 2>/dev/null || rm -f "$w"
    done
    # What wait.sh last reported to a session that no longer exists
    for w in "$SESSIONS"/*.seen(N); do
      [[ -f "${w%.seen}.json" ]] || rm -f "$w"
    done
    (( ${#items[@]} )) && sessions_json="$(printf '%s\n' "${items[@]}" | jq -cs '.' 2>/dev/null || echo '[]')"
  fi
  session="$(watch -c --argjson now "$(date +%s)" 'include "watch"; session_state($now)' <<<"$sessions_json" 2>/dev/null)" ||
    session='{"state":"none","detail":null,"id":null,"ticket":null,"lastSeen":null}'
  attended_line="$(watch -r 'include "watch"; session_prefix' <<<"$session") · $attended_line"
  # The whole queue for the runs document and `cdwr agent status`; the pick above stays the
  # line and the notice
  queue_view="$(watch -c --argjson now "$(date +%s)" --argjson watch "$state" --argjson session "$session" --argjson waits "$waits" \
    'include "watch"; .data.issues.nodes | queue_view($now; 5; $watch; $session; $waits)' <<<"$resp")" ||
    { note "warn: queue view: watch.jq failed"; queue_view=""; }
  # Should an implement-only session start? watch.jq `launch` decides from the pick and the
  # guards; implement.sh holds implement.lock while its session runs and writes the spend ledger.
  # The lock holds its owner's pid; it is cleared only when that process is gone (a kill skips the
  # EXIT trap). A lock without a pid older than a minute lost its owner between mkdir and write.
  local lockdir="$HOME_DIR/implement.lock" locked=false spent cap last decision owner
  if [[ -d "$lockdir" ]]; then
    owner="$(cat "$lockdir/pid" 2>/dev/null)"
    if [[ "$owner" == <-> ]] && ! kill -0 "$owner" 2>/dev/null ||
       [[ "$owner" != <-> && -n "$(find "$lockdir" -maxdepth 0 -mmin +1 2>/dev/null)" ]]; then
      rm -rf "$lockdir" && note "warn: cleared implement.lock; its session ${owner:-?} is gone"
    fi
  fi
  [[ -d "$lockdir" ]] && locked=true
  # jq prints `0` and still fails on a missing file, so check for it first
  spent=0
  # An unreadable ledger fails closed: the cap reads as spent
  if [[ -f "$HOME_DIR/implement-spend.jsonl" ]]; then
    spent="$(jq -s --arg d "$(date +%F)" '[.[] | select(.day == $d) | .cost] | add // 0' \
      "$HOME_DIR/implement-spend.jsonl" 2>/dev/null)" || spent=""
    [[ "$spent" == <->(|.<->) ]] || { note "warn: implement-spend.jsonl unreadable; no launch today"; spent=1000000; }
  fi
  cap="${AGENT_QUEUE_IMPLEMENT_CAP_USD:-40}"
  [[ "$cap" == <->(|.<->) ]] || cap=null
  last=null
  [[ -f "$HOME_DIR/launch.json" ]] && last="$(jq -ce 'objects' "$HOME_DIR/launch.json" 2>/dev/null || print null)"
  local guards
  guards="$(jq -nc --argjson session "$session" --argjson locked "$locked" --argjson spent "$spent" \
    --argjson cap "$cap" --argjson last "$last" \
    '{session: $session, locked: $locked, spent: $spent, cap: $cap, last: $last}')"
  decision="$(watch -c --argjson g "$guards" 'include "watch"; launch($g)' <<<"$verdict" 2>/dev/null)" ||
    { note "warn: launch: watch.jq failed"; decision='{"action":"skip","reason":"watch.jq failed","key":null}'; }
  if $check; then
    print -r -- "attended: $attended_line"
    print -r -- "launch: $(jq -r '.action + (if .reason then " (" + .reason + ")" else "" end)' <<<"$decision")"
    [[ -n "$queue_view" ]] && print -r -- "queue-view: $queue_view"
    return 0
  fi
  local action; action="$(jq -r '.action' <<<"$decision")"
  # Misses count only while work waits: once the pick is idle, a later launch starts fresh. Not on
  # `running`: a launched session holds a fresh claim, and its death must still count as a miss.
  [[ "$(jq -r '.verdict' <<<"$verdict")" == idle ]] && rm -f "$HOME_DIR/launch.json"
  if [[ "$action" == launch ]]; then
    jq -c '.last' <<<"$decision" > "$HOME_DIR/launch.json"
    # nohup and the plist's AbandonProcessGroup keep the session alive after this job exits
    nohup "$HOME_DIR/implement.sh" "$(jq -r '.key' <<<"$decision")" >/dev/null 2>&1 &
    note "launch: $(jq -r '.key' <<<"$decision") (pid $!)"
    notice info "Agent queue: started an implementing session, ${attended_line#*run now: }."
    return 0
  fi
  # Once per change, only with no live session (a live one picks the work up), and not for a
  # fresh agent:ready ticket: this scheduler plans that itself. A launch that a guard refused
  # (cap, back-off) says why.
  local file="$HOME_DIR/attended.json" key prev why=""
  [[ "$action" == notify ]] && why=" Not launched: $(jq -r '.reason' <<<"$decision")."
  key="$(jq -c --argjson s "$session" --arg a "$action" '{verdict, ticket, reason, session: $s.state, launch: $a}' <<<"$verdict")"
  prev="$(cat "$file" 2>/dev/null)"
  if [[ "$key" != "$prev" ]]; then
    print -r -- "$key" > "$file"
    sstate="$(jq -r '.state' <<<"$session")"
    if [[ "$(jq -r '.verdict' <<<"$verdict")" == run && "$(jq -r '.reason' <<<"$verdict")" != ready &&
          ( "$sstate" == none || "$sstate" == stopped ) && ! $locked ]]; then
      note "attended: $attended_line"
      notice action "Agent queue: no session running, ${attended_line#*run now: }.$why Start /work-queue."
    fi
  fi
}
attended

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

# The daily suggestion: team COD tickets labelled agent-idea still open, minus those the queue
# has already taken up (any Agent-group label); one left means no new suggestion.
read -r -d '' IDEAS <<'GQL' || true
query {
  issues(first: 50, filter: {
    team: { key: { eq: "COD" } }
    state: { type: { nin: ["completed", "canceled"] } }
    labels: { some: { name: { eq: "agent-idea" } } }
  }) {
    nodes { identifier labels { nodes { name } } }
  }
}
GQL

# suggest_gate: prints due (focus <dx|maintenance|looks>), done today, not before HH:00,
# skipped, COD-n is open, unavailable (Linear did not answer, so nothing runs), or off.
suggest_gate() {
  setopt local_options no_err_exit
  local stamp="$HOME_DIR/suggest-ran-on" ran age open hour ideas
  local -a focuses=(dx maintenance looks)
  if [[ "$SUGGEST_DAYS" != <-> || "$SUGGEST_DAYS" == 0 ]]; then print off; return 0; fi
  ran="$(cat "$stamp" 2>/dev/null)"
  if [[ "$ran" == <->-<->-<-> ]]; then
    age=$(( ( $(date +%s) - $(date -j -f %F "$ran" +%s 2>/dev/null || date -d "$ran" +%s 2>/dev/null || echo 0) ) / 86400 ))
    if (( age < SUGGEST_DAYS )); then print "done today"; return 0; fi
  fi
  hour=$(( 10#$(date +%H) ))
  if (( hour < SUGGEST_HOUR )); then printf 'not before %02d:00\n' "$SUGGEST_HOUR"; return 0; fi
  ideas="$(linear "$IDEAS" 2>/dev/null)" && jq -e '.data.issues.nodes' >/dev/null 2>&1 <<<"$ideas" ||
    { print "unavailable, Linear did not answer"; return 0; }
  open="$(jq -r '
    [.data.issues.nodes[]
     | select([.labels.nodes[].name | IN("agent:ready","agent:working","agent:needs-input","agent:review")] | any | not)
     | .identifier] | first // empty' <<<"$ideas" 2>/dev/null)"
  if [[ -n "$open" ]]; then print "skipped, $open is open"; return 0; fi
  print "due (focus ${focuses[$(( 10#$(date +%j) % 3 + 1 ))]})"
}

# The result handling both claude runs share: appends the readable result to the log, sets
# `spent`, and on a nonzero exit notes, notifies and records a cap or a failure, setting `outcome`.
#   run_outcome <a planning run|a suggest run> <log prefix> <budget> <log> <result> <rc>
run_outcome() {
  local label="$1" tag="$2" budget="$3" log="$4" result="$5" rc="$6" cost
  outcome=ok
  jq -r '.result // empty, (.errors // [])[]' "$result" >> "$log" 2>/dev/null || cat "$result" >> "$log"
  cost="$(jq -r '.total_cost_usd // empty' "$result" 2>/dev/null || true)"
  spent=""; [[ "$cost" == <->(|.<->) ]] && spent=" · \$$(printf '%.2f' "$cost") in $(jq -r '.num_turns // "?"' "$result") turns"
  (( rc != 0 )) || return 0
  if [[ "$(jq -r '.subtype // empty' "$result" 2>/dev/null)" == error_max_budget_usd ]]; then
    outcome=cap
    note "cap: ${tag:+$tag }stopped at the \$$budget budget (see $log)"
    notify "Agent queue: $label hit the \$$budget cap and stopped. Log: $log"
    record cap "" "${tag:+$tag: }stopped at the \$$budget budget, log $log"
  else
    outcome=failed
    note "fail: ${tag:+$tag }claude exited $rc (see $log)"
    notify "Agent queue: $label failed (exit $rc). Log: $log"
    record failed "" "${tag:+$tag: }claude exited $rc, log $log$spent"
  fi
}

# The once-a-day suggest session: read-only like the planning run, plus a taste file in memory.
# It ends with `SUGGESTED COD-n <title>` or `nothing today`.
suggest_run() {
  local focus="$1" log result rc=0 spent="" outcome verdict id title line
  local L=mcp__claude_ai_Linear S=mcp__claude_ai_Sentry
  cd "$REPO"
  git switch -q --detach origin/main 2>/dev/null ||
    { note "warn: worktree not clean, suggesting against its current state"; record warn "" "worktree not clean"; }
  log="$LOGS/$(date +%F_%H%M)-suggest.log"
  result="${log%.log}.json"
  note "suggest: focus $focus → $log"
  # Stamped as soon as it starts, so a crash can't run it twice in a day
  date +%F > "$HOME_DIR/suggest-ran-on"

  # Tool search would defer the Linear tools behind ToolSearch, which --tools leaves out.
  # The memory rules start with `//`: one leading slash is project-relative, two anchor at the root.
  # In a subshell: the App token is minted fresh for this run and reaches only this claude
  ( gh_identity_or_note
  ENABLE_TOOL_SEARCH=false claude -p "/suggest-improvement focus=$focus memory=${MEMORY_DIR:-none}" \
    --model opus \
    --settings '{"disabledMcpjsonServers":["linear","sentry"]}' \
    --disallowedTools mcp__linear mcp__sentry mcp__claude_ai_Supabase mcp__claude_ai_Claude_Docs \
    --tools "Read,Grep,Glob,Skill,Bash,Write,Edit" \
    --permission-mode dontAsk --permission-prompts none \
    --max-budget-usd "$SUGGEST_BUDGET_USD" --output-format json \
    --allowedTools Skill Read Grep Glob \
      "$L"__list_issues "$L"__get_issue "$L"__list_comments "$L"__list_issue_labels "$L"__list_documents "$L"__get_document "$L"__save_issue \
      "$S"__find_organizations "$S"__find_projects "$S"__search_issues "$S"__get_sentry_resource \
      "Bash(git log --since=30.days --name-only --format=)" "Bash(git log --since=30.days --grep=fix --name-only --format=)" "Bash(gh pr list *)" "Bash(gh pr view *)" "Bash(tools/cdwr/agent-queue/gh-review.sh threads *)" "Bash(node tools/cdwr/bin/cdwr.mjs agent usage*)" \
      ${MEMORY_DIR:+"Write(/$MEMORY_DIR/feedback_suggestion_taste.md)" "Edit(/$MEMORY_DIR/feedback_suggestion_taste.md)"}
  ) > "$result" 2> "$log" || rc=$?

  run_outcome "a suggest run" suggest "$SUGGEST_BUDGET_USD" "$log" "$result" "$rc"
  case "$outcome" in
    cap) suggested_line "stopped at the budget"; return 0 ;;
    failed) suggested_line "failed"; return 0 ;;
  esac

  # The last line that is a verdict, so a code fence or blank lines around it do not matter
  line="$(jq -r '.result // empty' "$result" 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' |
    grep -E '^(SUGGESTED .+|nothing today)$' | tail -n 1 || true)"
  if [[ "$line" == "SUGGESTED "* ]]; then
    verdict="${line#SUGGESTED }"
    id="${verdict%% *}"; title="${verdict#* }"
    [[ "$title" == "$verdict" ]] && title=""
    note "suggested: $id $title"
    record suggested "$id" "$title$spent"
    notice action "Agent idea: $id $title. Accept with agent:ready, or cancel with one word."
    suggested_line "$id $title"
  elif [[ "$line" == "nothing today" ]]; then
    note "suggest: nothing today"
    record nothing "" "suggest: nothing today$spent"
    suggested_line "nothing today"
  else
    note "warn: suggest: no verdict (see $log)"
    record warn "" "suggest: no verdict, see $log"
    suggested_line "no verdict"
  fi
}

if [[ -z "$ready" ]]; then
  gate="$(suggest_gate)"
  # The decision stays the last line: status reads it from there
  if $check; then print -r -- "suggest: $gate"; echo "idle: nothing to plan"; exit 0; fi
  case "$gate" in
    due*) suggest_run "${${gate#*focus }%)}" ;;
    skipped*)
      date +%F > "$HOME_DIR/suggest-ran-on"
      record skip "" "suggest: ${${gate#skipped, }%% *} still open"
      suggested_line "${gate#skipped, }" ;;
    unavailable*) note "suggest: $gate" ;;
  esac
  exit 0
fi
if $check; then
  print -r -- "suggest: $(suggest_gate)"
  echo "would plan one of: $(print -r -- "$ready" | tr '\n' ' ')"; exit 0
fi

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

spent="" outcome=""
run_outcome "a planning run" "" "$BUDGET_USD" "$log" "$result" "$rc"

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

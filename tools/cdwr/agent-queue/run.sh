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

# The Suggested line of queue_state: today's date and what happened
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
# Set by the container loop when the listener woke this run
wake=false; [[ "${1:-}" == "--wake" ]] && wake=true

# Run history, newest last, kept to its last 20 rows; the suggest run and `cdwr agent activity`
# read it. Idle adds no row.
RUNS="$HOME_DIR/runs.jsonl"
last_outcome=idle
# Why a guard refused the implementing launch this run, for last_run (watch.jq `launch` reason)
launch_note=""
# What telemetry_run sends: the last real outcome apart from its ticket and detail
RUN_STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
run_kind=plan outcome_name=idle outcome_ticket="" outcome_detail=""
attended_work=""
# record <outcome> [ticket] [detail]: a warn is a row, never the run's outcome. A warn also
# goes to the runs table as a row of its own, detached, so the desk shows it.
record() {
  $check && return 0
  [[ "$1" == warn ]] || { last_outcome="$1${2:+ $2}"; outcome_name="$1" outcome_ticket="${2:-}" outcome_detail="${3:-}"; }
  jq -nc --arg w "$(date '+%F %H:%M')" --arg o "$1" --arg t "${2:-}" --arg d "${3:-}" \
    '{when: $w, outcome: $o, ticket: $t, detail: $d}' >> "$RUNS" 2>/dev/null || true
  [[ "$1" == warn ]] && ( telemetry_run "$(date -u +%Y-%m-%dT%H:%M:%SZ)" warn "${2:-}" "${3:-}" "" "$run_kind" "" "" "" ) &!
  return 0
}

# to_main <what>: moves the checkout to origin/main and installs when its lockfile is not the one
# node_modules was last installed from, so the next run retries a failed install.
# A failed install is a warn; the run goes on.
to_main() {
  local lock marker=node_modules/.cdwr-lockfile
  git switch -q --detach origin/main 2>/dev/null ||
    { note "warn: worktree not clean, $1 against its current state"; record warn "" "worktree not clean"; return 0; }
  lock="$(git hash-object pnpm-lock.yaml 2>/dev/null)" || return 0
  [[ -r "$marker" && "$(<"$marker")" == "$lock" ]] && return 0
  if pnpm install --frozen-lockfile >> "$LOGS/scheduler.log" 2>&1; then
    print -r -- "$lock" > "$marker" 2>/dev/null || true
  else
    note "warn: install failed after a lockfile change"; record warn "" "install failed after a lockfile change"
  fi
  return 0
}

source "${0:A:h}/checkin.sh"
# A pause is deliberate: the tick takes no lock and still checks in ok, so the monitor does not
# alert. It publishes its queue state below, once that can be written.
paused=false
if [[ -e "$HOME_DIR/paused" ]] && ! $check; then paused=true; fi
if ! $paused; then
  if ! mkdir "$HOME_DIR/lock" 2>/dev/null; then say "busy: a run is in progress"; exit 0; fi
  trap 'rmdir "$HOME_DIR/lock" 2>/dev/null' EXIT
fi
CHECKIN_ID=""

source "${0:A:h}/lib.sh"
source "${0:A:h}/waits.sh"
source "${0:A:h}/github-app.sh"
source "${0:A:h}/telemetry.sh"
telemetry_env "$REPO/tools/cdwr/.env"
# Where session-hook.sh finds the key: the path goes to the sessions, never the key
[[ -r "$REPO/tools/cdwr/.env" ]] && export AGENT_QUEUE_ENV_FILE="$REPO/tools/cdwr/.env"

# Job state for queue_state and the run row: the interval launchd uses and whether the installed copy
# matches origin/main. Keep INTERVAL_SED in step with the line in agent.logic.ts.
PLIST="$HOME/Library/LaunchAgents/se.codeware.agent-queue.plist"
INTERVAL_SED='s/^export const RUN_INTERVAL_SECONDS = \([0-9][0-9]*\);$/\1/p'
# The container's listener is live: listener.json says so and it beat under 2 min ago
listener_live() {
  local beat
  beat="$(jq -r 'select(.state == "live") | .lastBeat | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601' "$HOME_DIR/listener.json" 2>/dev/null)" || return 1
  [[ "$beat" == <-> ]] && (( $(date +%s) - beat < 120 ))
}
# Prints the line; run in the current shell it also leaves job_kind and job_differs (a JSON array
# of what differs from origin/main, null when that can't be read) for job_state.
job_kind="" job_differs=null
job_line() {
  setopt local_options no_err_exit
  local dir=tools/cdwr/agent-queue secs want theirs f out kind=install
  local -a differs
  job_differs=null
  if [[ "${AGENT_QUEUE_HOST:-}" == container ]]; then
    # The container's copies under $HOME_DIR are the baked ones; a CI build bakes in its commit too
    kind=image
    [[ "${AGENT_IMAGE_SHA:-}" =~ '^[0-9a-f]{7,40}$' ]] && kind="image sha-${AGENT_IMAGE_SHA[1,7]}"
    secs="${RUN_INTERVAL_SECONDS:-}"
  else
    secs="$(plutil -extract StartInterval raw -o - "$PLIST" 2>/dev/null)"
  fi
  job_kind="$kind"
  if [[ $kind == image* && "${RUN_FALLBACK_SECONDS:-}" == <-> ]] && listener_live; then
    out="Job: live · fallback $(( RUN_FALLBACK_SECONDS / 60 )) min"
  elif [[ "$secs" == <-> ]]; then out="Job: every $(( secs / 60 )) min"; else out="Job: interval unknown"; fi
  want="$(git -C "$REPO" show origin/main:tools/cdwr/src/commands/agent/agent.logic.ts 2>/dev/null | sed -n "$INTERVAL_SED")"
  if [[ -z "$want" ]]; then print -r -- "$out · $kind unknown"; return 0; fi
  for f in run.sh lib.sh waits.sh watch.jq implement.sh github-app.sh notify.sh checkin.sh telemetry.sh; do
    theirs="$(git -C "$REPO" show "origin/main:$dir/$f" 2>/dev/null)" ||
      { print -r -- "$out · $kind unknown"; return 0; }
    [[ "$(cat "$HOME_DIR/$f" 2>/dev/null)" == "$theirs" ]] || differs+=("$f")
  done
  [[ "$secs" == "$want" ]] || differs+=(interval)
  job_differs="$(jq -nc '$ARGS.positional' --args "${differs[@]}")"
  if (( ${#differs} )); then print -r -- "$out · $kind out of date (${(j:, :)differs})"
  elif [[ $kind == image* ]]; then print -r -- "$out · $kind"
  else print -r -- "$out · install current"; fi
}

# The job line once per run, kept in $job for queue_state and the run row, and written to job.json,
# where a session reads whether the installed scripts that deny its tools are behind origin/main.
# Written with or without telemetry; --check writes nothing.
job=""
job_state() {
  $check && return 0
  setopt local_options no_err_exit
  local file="$HOME_DIR/job.json"
  # Through a file, not $(…): a subshell would keep job_kind and job_differs to itself
  job_line > "$file.line" 2>/dev/null
  job="$(<"$file.line")"
  rm -f "$file.line"
  jq -n --arg at "$(date -u +%FT%TZ)" --arg host "${AGENT_QUEUE_HOST:-launchd}" --arg kind "$job_kind" \
    --arg sha "${AGENT_IMAGE_SHA:-}" --arg line "$job" --argjson differs "${job_differs:-null}" \
    '{at: $at, host: $host, kind: $kind, imageSha: (if $sha == "" then null else $sha end), line: $line, differs: $differs}' \
    > "$file.tmp" 2>/dev/null && mv "$file.tmp" "$file"
  return 0
}

# Keeps runs.jsonl to its last 20 rows, and this run's Attended line and queue view for a later
# run that has no verdict of its own (record_queue_state falls back on them). Never a stop.
keep_state() {
  $check && return 0
  setopt local_options no_err_exit
  [[ -f "$RUNS" ]] && tail -n 20 "$RUNS" > "$RUNS.tmp" && mv "$RUNS.tmp" "$RUNS"
  [[ -n "$attended_line" ]] && print -r -- "$attended_line" > "$HOME_DIR/attended-line"
  [[ -n "$queue_view" ]] && print -r -- "$queue_view" > "$HOME_DIR/queue-view.json"
  return 0
}

# The day's implement spend from the ledger, 0 without one. A negative day (a correction, or a
# settle that once landed after midnight) counts as 0; an unreadable ledger prints null, which
# launch() refuses with its own reason.
spent_today() {
  setopt local_options no_err_exit
  local spent=0
  # jq prints `0` and still fails on a missing file, so check for it first
  if [[ -f "$HOME_DIR/implement-spend.jsonl" ]]; then
    spent="$(jq -s --arg d "$(date +%F)" '[.[] | select(.day == $d) | .cost] | add // 0' \
      "$HOME_DIR/implement-spend.jsonl" 2>/dev/null)" || spent=""
    if [[ "$spent" == (|-)<->(|.<->) ]]; then
      [[ "$spent" != -* ]] || spent=0
    else
      spent=null
    fi
  fi
  print -r -- "$spent"
}
# The daily implement cap in dollars; null when the setting is not a number
implement_cap() {
  local cap="${AGENT_QUEUE_IMPLEMENT_CAP_USD:-40}"
  [[ "$cap" == <->(|.<->) ]] || cap=null
  print -r -- "$cap"
}
# The job line as queue_state carries it: the day's spend against the cap, and a pause, after the
# line's own segments. The run row keeps the bare line, whose last segment is its version.
queue_job_line() {
  setopt local_options no_err_exit
  local line="$job" spent cap
  [[ -n "$line" ]] || return 0
  spent="$(spent_today)" cap="$(implement_cap)"
  [[ "$spent" != null && "$cap" != null ]] && line+=" · effort \$$(printf '%.2f' "$spent") of \$$cap"
  $paused && line+=" · paused"
  print -r -- "$line"
}
# This host's queue state as one row: the last run, the Attended and Suggested lines, the job
# line and the queue view. Detached like record_run.
record_queue_state() {
  $check && return 0
  telemetry_on || return 0
  setopt local_options no_err_exit
  local last attended suggested jl view
  last="$(date '+%F %H:%M') · $last_outcome${launch_note:+ · no launch: $launch_note}"
  # attended-published is the cache before attended-line, until a verdict replaces it
  attended="${attended_line:-$(cat "$HOME_DIR/attended-line" 2>/dev/null || cat "$HOME_DIR/attended-published" 2>/dev/null)}"
  suggested="$(cat "$HOME_DIR/suggested-line" 2>/dev/null)"
  jl="$(queue_job_line)"
  view="${queue_view:-$(cat "$HOME_DIR/queue-view.json" 2>/dev/null)}"
  ( telemetry_queue_state "$last" "$attended" "$suggested" "$jl" "$view" ) &!
}

# A paused tick publishes the last run's Attended line and queue view with a paused job line, so
# the desk reads a pause rather than a silent scheduler, and checks in ok
if $paused; then
  last_outcome=paused
  job_state
  record_queue_state
  checkin ok
  exit 0
fi

[[ -z "$key" ]] && { say "skip: no Linear API key (AGENT_QUEUE_LINEAR_KEY or Keychain service linear-agent-queue)"; exit 0; }
# No network is not a Linear failure: no record, no warn rows, the next run catches up
if offline; then say "skip: offline (Mac asleep?)"; exit 0; fi

linear_mcp "$HOME_DIR"
# linear_ok: true when the claude runs would have Linear tools. Without them nothing starts, the
# run is recorded as such, and one notice goes out per spell.
linear_ok() {
  linear_gate "$HOME_DIR" && return 0
  note "fail: no Linear tools ($linear_why)"
  record "no Linear tools" "" "$linear_why"
  $linear_new && notify "Agent queue: the claude runs have no Linear tools ($linear_why); nothing starts until they do."
  return 1
}

# The same usage as rows in the telemetry database: hour rows (6-hour lookback) every run, day rows
# at most once an hour. Detached, so it can't hold up the run; the command bounds itself with a
# 60 s deadline of its own. Without the env vars it does nothing.
record_usage() {
  $check && return 0
  setopt local_options no_err_exit
  telemetry_on || return 0
  local stamp="$HOME_DIR/usage-recorded-at" last kind=hour
  last="$(cat "$stamp" 2>/dev/null)"
  [[ "$last" == <-> ]] || last=0
  if (( $(date +%s) - last > 3600 )); then
    kind=both
    date +%s > "$stamp"
  fi
  ( cd "$REPO" && AGENT_SUPABASE_SERVICE_KEY="$AGENT_SUPABASE_SERVICE_KEY" node tools/cdwr/bin/cdwr.mjs agent usage-record --kind "$kind" --yes --json >/dev/null 2>&1 </dev/null ||
    { note "warn: usage rows: cdwr agent usage-record failed"
      # The runs table only: keep_state may be trimming runs.jsonl right now
      telemetry_run "$(date -u +%Y-%m-%dT%H:%M:%SZ)" warn "" "usage: cdwr agent usage-record failed" "" "$run_kind" "" "" ""; } ) &!
}

# The activity rows from Linear's issue history and runs.jsonl, made by `cdwr agent activity`.
# The CLI runs from $REPO, which follows origin/main, so it needs that checkout's install.
# Every run reads Linear; rows already sent are ignored by the upsert. Without the env vars it
# does nothing.
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
          id createdAt actor { name } botActor { name type }
          fromState { name } toState { name }
          addedLabels { name } removedLabels { name } updatedDescription
        }
      }
      comments(first: 50) { nodes { id createdAt body user { name } botActor { name type } } }
    }
  }
}
GQL
# A warn row at most once an hour, so a lasting failure can't push real rows out of runs.jsonl
activity_warn() {
  local stamp="$HOME_DIR/activity-warned-at" last
  note "warn: activity rows: $1"
  last="$(cat "$stamp" 2>/dev/null)"
  [[ "$last" == <-> ]] || last=0
  (( $(date +%s) - last > 3600 )) || return 0
  date +%s > "$stamp"
  record warn "" "activity: $1"
}
record_activity() {
  $check && return 0
  telemetry_on || return 0
  setopt local_options no_err_exit
  local pages="$HOME_DIR/activity-pages.jsonl" stamp="$HOME_DIR/activity-read-at" owed="$HOME_DIR/activity-owed"
  local resp after=null page out rows_json last
  # A woken run reads Linear's history at most once per 10 min, since events come in bursts. A
  # skipped read is owed: the container loop runs again within 10 min instead of waiting the hour.
  if $wake; then
    last="$(cat "$stamp" 2>/dev/null)"
    [[ "$last" == <-> ]] || last=0
    (( $(date +%s) - last >= 600 )) || { : > "$owed"; return 0; }
  fi
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
    (( page == 8 )) && note "warn: activity rows: more than 8 pages of tickets, the rest left out"
  done
  resp="$(jq -cs '{data: {issues: {nodes: add}}}' "$pages")"
  out="$(cd "$REPO" && node tools/cdwr/bin/cdwr.mjs agent activity --runs "$RUNS" --json 2>/dev/null <<<"$resp")"
  rows_json="$(jq -ce '.result.rows' <<<"$out" 2>/dev/null)" || { activity_warn "cdwr agent activity failed"; return 0; }
  # Only a read that went through counts; a failed one is tried again by the next run
  date +%s > "$stamp"
  rm -f "$owed"
  [[ "$rows_json" == "[]" ]] && return 0
  # Duplicates are ignored. Never waited for.
  ( supabase_upsert activity event_id "$rows_json" merge ) &!
  return 0
}

# One row for this run in the telemetry database, detached so it can't slow the exit.
# --check starts nothing and sends nothing.
record_run() {
  $check && return 0
  telemetry_on || return 0
  setopt local_options no_err_exit
  local jl interval="" version="" limit
  jl="$job"
  [[ "$jl" =~ '(every|fallback) ([0-9]+) min' ]] && interval=$(( match[2] * 60 ))
  [[ "$jl" == *' · '* ]] && version="${jl##* · }"
  limit="$(jq -r '.limit.max // empty' <<<"${queue_view:-null}" 2>/dev/null)"
  ( telemetry_run "$RUN_STARTED" "$outcome_name" "$outcome_ticket" "$outcome_detail" "$attended_work" \
      "$run_kind" "$interval" "$limit" "$version" ) &!
}
# Every handled outcome exits 0, so a non-zero exit is a failure nothing recorded.
on_exit() {
  local st=$1
  rm -f "$LOGS/gh-read-fallback.$$"
  if (( st != 0 )); then
    note "fail: run.sh exited $st"
    record failed "" "run.sh exited $st, see scheduler.log"
  fi
  # Activity first: its warn row belongs in this run's history
  record_usage
  record_activity
  keep_state
  job_state
  record_queue_state
  record_run "$st"
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
# The decisions live in watch.jq, installed next to this file. It watches every ticket an agent
# label still claims, since Håkan may merge from a gate; RELABEL is its one Linear write.
read -r -d '' WATCHED <<'GQL' || true
query {
  issues(first: 100, filter: {
    team: { key: { eq: "COD" } }
    labels: { some: { name: { in: ["agent:working", "agent:needs-input", "agent:review"] } } }
    state: { type: { neq: "canceled" } }
    or: [{ completedAt: { null: true } }, { completedAt: { gt: "-P14D" } }]
  }) {
    nodes {
      id
      identifier
      description
      labels { nodes { id name } }
      attachments { nodes { url createdAt } }
      comments(first: 50, orderBy: createdAt) { nodes { body createdAt } }
    }
  }
  issueLabels(filter: { name: { eq: "agent:review" } }) { nodes { id team { key } } }
}
GQL
# A ticket merged outside review ends as agent:review with a Next line saying so. The labels
# change by id, so labels added since the read stay.
read -r -d '' RELABEL <<'GQL' || true
mutation($id: String!, $add: [String!], $remove: [String!], $d: String) {
  issueUpdate(id: $id, input: { addedLabelIds: $add, removedLabelIds: $remove, description: $d }) { success }
}
GQL
read -r -d '' PR_QUERY <<'GQL' || true
query($n: Int!) {
  repository(owner: "codeware-sthlm", name: "cdwr") {
    pullRequest(number: $n) {
      state
      mergedAt
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

# relabel_merged <node> <merged at> <agent:review label id>: the watch's one Linear write, for a
# ticket whose PR merged outside review: agent:review in, its other agent label out, and the Next
# line saying it merged and what is handed off. True only when Linear took it, so a failed write
# is tried again on the next run.
relabel_merged() {
  local node="$1" when="${2:-$(date -u +%FT%TZ)}" review="$3" id vars resp
  id="$(jq -r '.identifier' <<<"$node")"
  [[ -n "$review" ]] || { note "warn: watch: no agent:review label for $id"; record warn "$id" "watch: no agent:review label"; return 1; }
  vars="$(watch -c --arg when "$when" --arg review "$review" '
    include "watch";
    handoffs as $h
    | { id, add: [$review],
        remove: [ .labels.nodes[] | select((.name | startswith("agent:")) and .name != "agent:review") | .id ],
        d: (.description | merged_next($when; $h)) }' <<<"$node")" ||
    { note "warn: watch: watch.jq failed relabelling $id"; record warn "$id" "watch: relabel failed"; return 1; }
  resp="$(linear "$RELABEL" "$vars")"
  if ! jq -e '.data.issueUpdate.success == true' >/dev/null 2>&1 <<<"$resp"; then
    note "warn: watch: relabel of $id failed ($(jq -c '.errors[0].message // "no answer"' <<<"$resp" 2>/dev/null))"
    record warn "$id" "watch: relabel failed"
    return 1
  fi
  note "watch: $id merged outside review, relabelled agent:review"
}

watch_prs() {
  # One PR failing to read skips that PR, not the rest.
  setopt local_options no_err_exit
  local file="$HOME_DIR/watch.json" resp nodes state node id label pr now out level msg review
  gh_identity_or_note
  resp="$(linear "$WATCHED")" || { print -r -- "Linear did not answer"; return 1; }
  jq -e '.data.issues.nodes' >/dev/null <<<"$resp" 2>/dev/null ||
    { print -r -- "Linear error $(jq -c '.errors[0].message' <<<"$resp" 2>/dev/null)"; return 1; }
  # A full page means tickets beyond it go unwatched
  [[ "$(jq '.data.issues.nodes | length' <<<"$resp")" -lt 100 ]] ||
    { note "warn: watch: 100 tickets, the page limit; later ones are not watched"; record warn "" "watch: page limit reached"; }
  # Same repo rule as planning: tickets labelled for another repo have no PR here.
  nodes="$(jq -c --argjson other "$OTHER_REPOS" '[.data.issues.nodes[]
    | select((.labels.nodes | map(.name | IN($other[])) | any) | not)]' <<<"$resp")"
  # A missing or broken state file counts as empty; tickets no longer watched drop out.
  state="$(jq -c 'if type == "object" then . else {} end' "$file" 2>/dev/null || print '{}')"
  state="$(watch -c --argjson ids "$(jq -c 'map(.identifier)' <<<"$nodes")" \
    'include "watch"; prune($ids)' <<<"$state")" || { print -r -- "watch.jq failed"; return 1; }
  # The team's own agent:review label before a workspace one
  review="$(jq -r '[.data.issueLabels.nodes[]? | select(.team == null or .team.key == "COD")]
    | sort_by(.team == null) | first | .id // empty' <<<"$resp")"

  for node in ${(f)"$(jq -c '.[]' <<<"$nodes")"}; do
    id="$(jq -r '.identifier' <<<"$node")"
    label="$(watch -r 'include "watch"; agent_label // empty' <<<"$node")"
    pr="$(watch 'include "watch"; pr_number // empty' <<<"$node")"
    # Outside review only the attached PR counts: a search could find a PR that merely names the
    # ticket, and a merge there would relabel it
    if [[ -z "$pr" && "$label" == agent:review ]]; then
      pr="$(gh_read gh pr list --repo codeware-sthlm/cdwr --state all --search "\"$id\" in:title,body" \
        --json number --limit 1 --jq '.[0].number // empty')" || { note "warn: watch: no PR lookup for $id"; record warn "$id" "watch: no PR lookup"; continue; }
    fi
    [[ -z "$pr" ]] && continue
    now="$(gh_read gh api graphql -f query="$PR_QUERY" -F n="$pr" --jq '.data.repository.pullRequest')"
    if [[ $? -ne 0 || -z "$now" || "$now" == null ]]; then
      note "warn: watch: could not read PR #$pr ($id)"; record warn "$id" "watch: could not read PR #$pr"; continue
    fi
    out="$(watch -cn --arg id "$id" --arg agentLabel "$label" --argjson pr "$pr" --argjson node "$node" --argjson now "$now" \
      --argjson state "$state" --arg at "$(date -u +%FT%TZ)" '
      include "watch";
      {id: $id, agentLabel: $agentLabel, pr: $pr, now: ($now | pr_state), prev: $state[$id], handoffs: ($node | handoffs), at: $at} | step')" ||
      { note "warn: watch: watch.jq failed on $id"; record warn "$id" "watch: watch.jq failed"; continue; }
    while IFS=$'\t' read -r level msg; do
      [[ -z "$level" ]] && continue
      note "watch: $level $msg"
      notice "$level" "$msg"
    done <<<"$(jq -r '.notices[] | "\(.level)\t\(.message)"' <<<"$out")"
    if [[ "$(jq -r '.relabel' <<<"$out")" == true ]]; then
      relabel_merged "$node" "$(jq -r '.mergedAt // empty' <<<"$now")" "$review" &&
        out="$(jq -c '.entry.relabelled = true' <<<"$out")"
    fi
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
  resp="$(linear "$ATTENDED_QUERY" | attended_nodes)"
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
  [[ "$(jq -r '.verdict' <<<"$verdict" 2>/dev/null)" == idle ]] && attended_work=false || attended_work=true
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
        rm -f "$f" "${f%.json}.watcher" "${f%.json}.seen" "$f.mirrored" "$f.beat"; continue
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
  # The whole queue for queue_state and `cdwr agent status`; the pick above stays the
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
  spent="$(spent_today)"
  [[ "$spent" == null ]] && note "warn: implement-spend.jsonl unreadable; no launch today"
  cap="$(implement_cap)"
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
  # A session without Linear tools can't read its ticket; it would only count as a miss
  if [[ "$action" == launch ]] && ! linear_ok; then return 0; fi
  if [[ "$action" == launch ]]; then
    jq -c '.last' <<<"$decision" > "$HOME_DIR/launch.json"
    # nohup and the plist's AbandonProcessGroup keep the session alive after this job exits.
    # The key goes to the launcher alone; implement.sh un-exports it before claude starts.
    AGENT_SUPABASE_SERVICE_KEY="${AGENT_SUPABASE_SERVICE_KEY:-}" nohup "$HOME_DIR/implement.sh" "$(jq -r '.key' <<<"$decision")" >/dev/null 2>&1 &
    note "launch: $(jq -r '.key' <<<"$decision") (pid $!)"
    notice info "Agent queue: started an implementing session, ${attended_line#*run now: }."
    return 0
  fi
  # Once per change, only with no live session (a live one picks the work up), and not for a
  # fresh agent:ready ticket: this scheduler plans that itself. A launch that a guard refused
  # (cap, back-off) says why.
  local file="$HOME_DIR/attended.json" key prev why=""
  if [[ "$action" == notify ]]; then
    launch_note="$(jq -r '.reason' <<<"$decision")"
    why=" Not launched: $launch_note."
  fi
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
# status reads this line: whether a claude run here would have Linear tools
if $check; then
  why="$(linear_tools)"
  if [[ -n "$why" ]]; then print -r -- "linear: missing ($why)"; else print -r -- "linear: ok ($LINEAR_MCP)"; fi
fi
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
  local S=mcp__claude_ai_Sentry
  run_kind=suggest
  linear_ok || { suggested_line "no Linear tools"; return 0; }
  cd "$REPO"
  to_main suggesting
  log="$LOGS/$(date +%F_%H%M)-suggest.log"
  result="${log%.log}.json"
  note "suggest: focus $focus → $log"
  # Stamped as soon as it starts, so a crash can't run it twice in a day
  date +%F > "$HOME_DIR/suggest-ran-on"

  # Tool search would defer the Linear tools behind ToolSearch, which --tools leaves out.
  # The memory rules start with `//`: one leading slash is project-relative, two anchor at the root.
  # In a subshell: the App token is minted fresh for this run and reaches only this claude
  ( gh_identity_or_note
  "${claude_env[@]}" ENABLE_TOOL_SEARCH=false claude -p "/suggest-improvement focus=$focus memory=${MEMORY_DIR:-none} runs=$RUNS" \
    --model opus "${LINEAR_MCP_ARGS[@]}" \
    --settings '{"disabledMcpjsonServers":["linear","sentry"]}' \
    --disallowedTools mcp__linear mcp__sentry mcp__claude_ai_Supabase mcp__claude_ai_Claude_Docs \
    --tools "Read,Grep,Glob,Skill,Bash,Write,Edit" \
    --permission-mode dontAsk --permission-prompts none \
    --max-budget-usd "$SUGGEST_BUDGET_USD" --output-format json \
    --allowedTools Skill Read Grep Glob \
      "$L"__list_issues "$L"__get_issue "$L"__list_comments "$L"__list_issue_labels "$L"__save_issue \
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

linear_ok || exit 0
cd "$REPO"
to_main planning

log="$LOGS/$(date +%F_%H%M).log"
result="${log%.log}.json"
note "plan: $(print -r -- "$ready" | tr '\n' ' ')→ $log"

rc=0
# Tool search would defer the Linear tools behind ToolSearch, which --tools leaves out.
"${claude_env[@]}" ENABLE_TOOL_SEARCH=false claude -p "/work-queue unattended once plan-only" \
  --model opus "${LINEAR_MCP_ARGS[@]}" \
  --settings '{"disabledMcpjsonServers":["linear","sentry"]}' \
  --disallowedTools mcp__linear mcp__sentry mcp__claude_ai_Sentry mcp__claude_ai_Supabase mcp__claude_ai_Claude_Docs \
  --tools "Read,Grep,Glob,Skill" \
  --permission-mode dontAsk \
  --permission-prompts none \
  --max-budget-usd "$BUDGET_USD" \
  --output-format json \
  --allowedTools \
    Skill Read Grep Glob \
    "$L"__list_issues "$L"__get_issue "$L"__list_comments "$L"__list_issue_labels "$L"__get_attachment \
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

#!/bin/zsh
# Scheduled plan-only /work-queue run for the cdwr repo.
# Claude may read the repo and write plans and comments to Linear; nothing else.
# --tools removes Write, Edit and Bash outright; dontAsk denies any MCP tool not listed.
# Project MCP servers (linear, sentry via infisical production) never start, and other
# connectors are denied by name, so local allow rules can't widen the run. Add new
# connectors to --disallowedTools when they appear.
#   run.sh          normal run (launchd)
#   run.sh --check  print the decision, start nothing
#   run.sh --platform  the platform step alone, when due (the container loop between runs)
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
# Budget for the weekly devlog session, same reading as above.
DEVLOG_BUDGET_USD="${AGENT_QUEUE_DEVLOG_BUDGET_USD:-5}"
# Days between devlog sessions; 0 switches the feature off. It starts after SUGGEST_HOUR too.
DEVLOG_DAYS="${AGENT_QUEUE_DEVLOG_DAYS:-7}"
# Budget for the daily review session, same reading as above.
REVIEW_BUDGET_USD="${AGENT_QUEUE_REVIEW_BUDGET_USD:-5}"
# Days between review sessions; 0 switches the schedule off (a desk request still runs one). It
# starts after SUGGEST_HOUR too.
REVIEW_DAYS="${AGENT_QUEUE_REVIEW_DAYS:-1}"
# The dev checkout's Claude memory directory; empty means no memory file is writable.
MEMORY_DIR="${AGENT_QUEUE_MEMORY_DIR:-}"
OTHER_REPOS='["nx-plugins","enjinex"]'
LOGS="$HOME_DIR/logs"
mkdir -p "$LOGS"

# The Suggested line of queue_state: today's date and what happened
suggested_line() { print -r -- "$(date +%F) · $*" > "$HOME_DIR/suggested-line"; }
# The Devlog line of queue_state: the date and what happened
devlog_line() { print -r -- "$(date +%F) · $*" > "$HOME_DIR/devlog-line"; }
# The review line of queue_state: the date and what happened
review_line() { print -r -- "$(date +%F) · $*" > "$HOME_DIR/review-line"; }
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
# Set by the container loop between runs: record_platform and nothing else
platform=false; [[ "${1:-}" == "--platform" ]] && platform=true

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

# to_main <what> [quiet]: moves the checkout to origin/main and installs when its lockfile is not
# the one node_modules was last installed from, so the next run retries a failed install.
# A failed install is a warn; the run goes on. With quiet (the detached platform move) a warn is
# only noted: a record from there would race the tick's runs.jsonl writes.
to_main() {
  local lock marker="$REPO/node_modules/.cdwr-lockfile"
  git -C "$REPO" switch -q --detach origin/main 2>/dev/null ||
    { note "warn: worktree not clean, $1 against its current state"; [[ -n "${2:-}" ]] || record warn "" "worktree not clean"; return 0; }
  lock="$(git -C "$REPO" hash-object pnpm-lock.yaml 2>/dev/null)" || return 0
  [[ -r "$marker" && "$(<"$marker")" == "$lock" ]] && return 0
  if pnpm -C "$REPO" install --frozen-lockfile >> "$LOGS/scheduler.log" 2>&1; then
    print -r -- "$lock" > "$marker" 2>/dev/null || true
  else
    note "warn: install failed after a lockfile change"; [[ -n "${2:-}" ]] || record warn "" "install failed after a lockfile change"
  fi
  return 0
}

# True while implement.sh holds implement.lock: its pid answers, or it has no pid yet and is under
# a minute old (lost between mkdir and the write otherwise). Its session runs in $REPO outside the
# queue lock, so the checkout must not move under it.
implement_live() {
  local lockdir="$HOME_DIR/implement.lock" owner
  [[ -d "$lockdir" ]] || return 1
  owner="$(cat "$lockdir/pid" 2>/dev/null)"
  if [[ "$owner" == <-> ]]; then
    kill -0 "$owner" 2>/dev/null
  else
    [[ -z "$(find "$lockdir" -maxdepth 0 -mmin +1 2>/dev/null)" ]]
  fi
}
# True while a run holds the queue lock, by the same rule as implement_live: a kill skips the EXIT
# trap, so a lock whose owner is gone must not block every later run until the container restarts.
run_lock_live() {
  local lockdir="$HOME_DIR/lock" owner
  [[ -d "$lockdir" ]] || return 1
  owner="$(cat "$lockdir/pid" 2>/dev/null)"
  if [[ "$owner" == <-> ]]; then
    kill -0 "$owner" 2>/dev/null
  else
    [[ -z "$(find "$lockdir" -maxdepth 0 -mmin +1 2>/dev/null)" ]]
  fi
}
# take_run_lock <pid>: takes the queue lock for pid, clearing one whose owner is gone first.
# Non-zero when another run still holds it. Two runs may both find the owner gone, so the clearing
# goes under lock.takeover and the owner is checked again there: without it one run could remove
# the lock the other had just taken. A takeover left by a killed run is cleared after a minute.
take_run_lock() {
  local lockdir="$HOME_DIR/lock" takeover="$HOME_DIR/lock.takeover" owner
  if ! mkdir "$lockdir" 2>/dev/null; then
    run_lock_live && return 1
    [[ -n "$(find "$takeover" -maxdepth 0 -mmin +1 2>/dev/null)" ]] && rmdir "$takeover" 2>/dev/null
    mkdir "$takeover" 2>/dev/null || return 1
    if run_lock_live; then rmdir "$takeover" 2>/dev/null; return 1; fi
    owner="$(cat "$lockdir/pid" 2>/dev/null)"
    rm -rf "$lockdir"
    note "warn: cleared lock; its run ${owner:-?} is gone"
    mkdir "$lockdir" 2>/dev/null || { rmdir "$takeover" 2>/dev/null; return 1; }
    print -r -- "$1" > "$lockdir/pid" 2>/dev/null
    rmdir "$takeover" 2>/dev/null
    return 0
  fi
  print -r -- "$1" > "$lockdir/pid" 2>/dev/null
  return 0
}
# drop_run_lock <pid>: removes the queue lock only when pid owns it
drop_run_lock() {
  [[ -r "$HOME_DIR/lock/pid" && "$(cat "$HOME_DIR/lock/pid" 2>/dev/null)" == "$1" ]] || return 0
  rm -rf "$HOME_DIR/lock"
}
# implement_live, or a launch under a minute ago (launch.json is written then): implement.sh starts
# detached and takes implement.lock only after the launching tick may have dropped the queue lock
implement_near() {
  implement_live || [[ -n "$(find "$HOME_DIR/launch.json" -mmin -1 2>/dev/null)" ]]
}

source "${0:A:h}/checkin.sh"
source "${0:A:h}/telemetry.sh"
telemetry_env_search "$REPO"
# Where session-hook.sh finds the key: the path goes to the sessions, never the key
[[ -r "$REPO/tools/cdwr/.env" ]] && export AGENT_QUEUE_ENV_FILE="$REPO/tools/cdwr/.env"

source "${0:A:h}/github-app.sh"

# The platform step's credentials, read like the telemetry key: from the environment or the same
# env files as plain KEY=VALUE text, never sourced; whatever is already set wins. They stay shell
# variables and are never exported (an exported one is unexported here), so no child inherits
# them, claude sessions included: record_platform names them on its own command line. Only the
# database and Fly ones turn the step on; the Infisical, Sentry and Umami ones are optional reads.
# The backup url turns on only the backup step (record_backup).
PLATFORM_VARS=(FLY_API_TOKEN PLATFORM_DATABASE_URL PLATFORM_BACKUP_DATABASE_URL PLATFORM_INFISICAL_CLIENT_ID PLATFORM_INFISICAL_CLIENT_SECRET PLATFORM_INFISICAL_PROJECT_ID PLATFORM_SENTRY_AUTH_TOKEN PLATFORM_SENTRY_ORG PLATFORM_UMAMI_URL PLATFORM_UMAMI_API_KEY)
# The write credentials of the desk's restart and gate commands, read the same way and kept apart
# from the read-only ones above: only desk_cdwr names them, on the command line of the cdwr call
# that applies a command, so the platform read never holds a credential that writes. The apply
# list's migrations use DESK_SUPABASE_DB_URL, named only by apply_cdwr.
DESK_VARS=(DESK_FLY_TOKEN DESK_INFISICAL_CLIENT_ID DESK_INFISICAL_CLIENT_SECRET DESK_INFISICAL_PROJECT_ID DESK_SUPABASE_DB_URL)
unexported_env() {
  local v file line key value common
  local -a names=("$@")
  for v in $names; do
    [[ -z "${(P)v+x}" ]] || typeset -g +x "$v"
  done
  common="$(git -C "$REPO" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || common=""
  for file in "${AGENT_QUEUE_ENV_FILE:-}" "$REPO/tools/cdwr/.env" "${common:+${common:h}/tools/cdwr/.env}"; do
    [[ -n "$file" && -r "$file" ]] || continue
    for line in "${(@f)$(<"$file")}"; do
      [[ "$line" == [A-Z_]*=* ]] || continue
      key="${line%%=*}"
      (( ${names[(Ie)$key]} )) || continue
      value="${line#*=}"
      value="${${value#[\"\']}%[\"\']}"
      [[ -n "${(P)key:-}" ]] || { typeset -g "$key=$value"; typeset -g +x "$key"; }
    done
  done
  return 0
}
platform_env() { unexported_env $PLATFORM_VARS; }
platform_env
unexported_env $DESK_VARS
platform_on() { [[ -n "${PLATFORM_DATABASE_URL:-}" && -n "${FLY_API_TOKEN:-}" ]]; }
desk_platform_on() {
  [[ -n "${DESK_FLY_TOKEN:-}" && -n "${DESK_INFISICAL_CLIENT_ID:-}" && -n "${DESK_INFISICAL_CLIENT_SECRET:-}" && -n "${DESK_INFISICAL_PROJECT_ID:-}" ]]
}

# One PR as the watch and the desk's copilot and merge commands read it
read -r -d '' PR_QUERY <<'GQL' || true
query($n: Int!) {
  repository(owner: "codeware-sthlm", name: "cdwr") {
    pullRequest(number: $n) {
      id
      headRefName
      headRefOid
      state
      isDraft
      mergedAt
      mergeCommit { oid }
      reviewDecision
      files(first: 100) { pageInfo { hasNextPage } nodes { path changeType } }
      mergeable
      mergeStateStatus
      mergeQueueEntry { state }
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      reviewThreads(first: 100) {
        pageInfo { hasNextPage }
        nodes { isResolved comments(last: 1) { nodes { author { __typename login } body } } }
      }
      reviewRequests(first: 20) {
        nodes { requestedReviewer { __typename ... on Bot { login } ... on User { login } } }
      }
      reviews(last: 50) { nodes { author { login } } }
      timelineItems(last: 1, itemTypes: [REMOVED_FROM_MERGE_QUEUE_EVENT]) {
        nodes { ... on RemovedFromMergeQueueEvent { reason createdAt } }
      }
    }
  }
}
GQL
# The desk's merge: the PR joins main's merge queue, only while its head is the one checked
read -r -d '' ENQUEUE <<'GQL' || true
mutation($id: ID!, $oid: GitObjectID) {
  enqueuePullRequest(input: { pullRequestId: $id, expectedHeadOid: $oid }) { mergeQueueEntry { state } }
}
GQL

# jq's stderr goes to a file, since every call that can fail runs in a command substitution; each
# call overwrites it, and a failure still prints it for the calls nobody checks. watch_err prints
# its first line as " (<line>)", cut to 120 characters, or nothing.
# watch.jq sits beside this script: the installed copy under the queue home, or the checkout's
# when an attended-only machine's `status` runs the checkout's run.sh
WATCH_DIR="${0:A:h}"
watch() {
  jq -L "$WATCH_DIR" "$@" 2> "$LOGS/watch.$$.err" && return 0
  local st=$?
  cat "$LOGS/watch.$$.err" >&2
  return $st
}
watch_err() {
  setopt local_options no_err_exit extended_glob
  local line=""
  [[ -s "$LOGS/watch.$$.err" ]] && IFS= read -r line < "$LOGS/watch.$$.err"
  line="${${line##[[:space:]]#}%%[[:space:]]#}"
  [[ -n "$line" ]] && print -rn -- " (${line[1,120]})"
  return 0
}

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

# Håkan's fine-grained token for the Copilot request, used only when the app is refused: the env,
# else its line in tools/cdwr/.env, read as text and never sourced. Empty when there is none.
copilot_token() {
  setopt local_options no_err_exit
  local line=""
  if [[ -n "${AGENT_COPILOT_TOKEN:-}" ]]; then print -r -- "$AGENT_COPILOT_TOKEN"; return 0; fi
  [[ -r "$REPO/tools/cdwr/.env" ]] || return 0
  line="$(grep -m1 '^AGENT_COPILOT_TOKEN=' "$REPO/tools/cdwr/.env")"
  line="${line#*=}"
  print -r -- "${${line#[\"\']}%[\"\']}"
}

# desk_pr_check <copilot|merge> <ticket> <pr>: prints `ok <node id> <head oid>` when the command
# may go ahead, else the reason to refuse it. Only a PR the watch already holds for that ticket is
# touched, so a desk token reaches no other PR, and the PR is read again here, as the app, so a desk
# showing old data can't merge a PR that changed since. Run it in a command substitution.
desk_pr_check() {
  setopt local_options no_err_exit
  local kind=$1 ticket=$2 pr=$3 node
  [[ "$ticket" == COD-<-> && "$pr" == <-> ]] || { print -r -- "bad ticket or PR"; return 0; }
  jq -e --arg t "$ticket" --argjson pr "$pr" '.[$t].pr == $pr' "$HOME_DIR/watch.json" >/dev/null 2>&1 ||
    { print -r -- "PR $pr is not watched for $ticket"; return 0; }
  gh_identity || { print -r -- "no GitHub app"; return 0; }
  node="$(gh api graphql -f query="$PR_QUERY" -F n="$pr" --jq '.data.repository.pullRequest' 2>/dev/null)"
  [[ -n "$node" && "$node" != null ]] || { print -r -- "could not read PR $pr"; return 0; }
  watch -r --arg kind "$kind" 'include "watch"; desk_verdict($kind)' <<<"$node" ||
    print -r -- "watch.jq failed$(watch_err)"
}

# True when the PR, read again as the app, has Copilot requested or reviewed (pr_state.copilot)
copilot_asked() {
  local s
  s="$(gh api graphql -f query="$PR_QUERY" -F n="$1" --jq '.data.repository.pullRequest' 2>/dev/null |
    watch -r 'include "watch"; pr_state.copilot')"
  [[ "$s" == requested || "$s" == reviewed ]]
}

# copilot_request <pr>: asks Copilot to review the PR, as the app first. It falls back on
# copilot_token when the app is missing or refused, or when GitHub takes the call without adding Copilot (an
# author with no Copilot seat). Shared by the desk's copilot command and the watch's own request.
# Prints the reason and returns 1 on failure. Run it in a command substitution.
copilot_request() {
  setopt local_options no_err_exit
  local pr=$1 out="" token
  local -a request=(gh api -X POST "repos/codeware-sthlm/cdwr/pulls/$pr/requested_reviewers"
    -f 'reviewers[]=copilot-pull-request-reviewer[bot]' --silent)
  # Without the app the token is still tried, and the PR is read again as the token
  if gh_identity; then
    out="$("${request[@]}" 2>&1)" && copilot_asked "$pr" && return 0
  else
    out="no GitHub app"
  fi
  token="$(copilot_token)"
  if [[ -n "$token" ]]; then
    out="$(GH_TOKEN="$token" GITHUB_TOKEN="$token" "${request[@]}" 2>&1)" &&
      GH_TOKEN="$token" GITHUB_TOKEN="$token" copilot_asked "$pr" && return 0
  fi
  [[ -n "$out" ]] || out="GitHub did not add Copilot as a reviewer"
  out=${out%%$'\n'*}
  print -r -- "${out[1,160]:-GitHub refused}"
  return 1
}

# desk_pr_act <copilot|merge> <pr> <node id> <head oid>: the GitHub write, always as the app (the
# Copilot request as copilot_request makes it). Prints the reason and returns 1 on failure. Run it
# in a command substitution.
desk_pr_act() {
  setopt local_options no_err_exit
  local kind=$1 pr=$2 id=$3 oid=$4 out=""
  [[ "$kind" == copilot ]] && { copilot_request "$pr"; return; }
  gh_identity || { print -r -- "no GitHub app"; return 1; }
  case "$kind" in
    merge)
      out="$(gh api graphql -f query="$ENQUEUE" -f id="$id" -f oid="$oid" 2>&1)" && return 0 ;;
    *) out="unknown kind" ;;
  esac
  out=${out%%$'\n'*}
  print -r -- "${out[1,160]:-GitHub refused}"
  return 1
}

# desk_cdwr <cdwr args>...: one cdwr command from $REPO with --yes --json, the desk's write
# credentials its only ones: naming FLY_ACCESS_TOKEN and INFISICAL_SERVICE_TOKEN keeps dotenv from
# filling another credential in from tools/cdwr/.env. The desk token goes in FLY_ACCESS_TOKEN too:
# flyctl reads it before FLY_API_TOKEN and takes an empty one as set, so it would find no token.
# Prints its stdout; stderr is dropped.
desk_cdwr() {
  ( cd "$REPO" && FLY_API_TOKEN="$DESK_FLY_TOKEN" FLY_ACCESS_TOKEN="$DESK_FLY_TOKEN" \
      INFISICAL_CLIENT_ID="$DESK_INFISICAL_CLIENT_ID" INFISICAL_CLIENT_SECRET="$DESK_INFISICAL_CLIENT_SECRET" \
      INFISICAL_PROJECT_ID="$DESK_INFISICAL_PROJECT_ID" INFISICAL_SERVICE_TOKEN="" \
      node tools/cdwr/bin/cdwr.mjs "$@" --yes --json 2>/dev/null </dev/null )
}

# desk_platform_argv <restart|gate> <args json>: the cdwr arguments, one per line, production only;
# returns 1 when the args don't hold. desk-command checked them already; this keeps a bad row off a
# command line. A close always generates the password.
desk_platform_argv() {
  setopt local_options no_err_exit extended_glob
  local tenant app action
  tenant="$(jq -r '.tenant // ""' <<<"$2" 2>/dev/null)"
  [[ "$tenant" == [a-z0-9][a-z0-9-]# ]] || return 1
  case "$1" in
    restart)
      app="$(jq -r '.app // ""' <<<"$2" 2>/dev/null)"
      [[ "$app" == cdwr-cms-[a-z0-9][a-z0-9-]# ]] || return 1
      print -rl -- fly restart "$app" ;;
    gate)
      action="$(jq -r '.action // ""' <<<"$2" 2>/dev/null)"
      [[ "$action" == (open|close) ]] || return 1
      print -rl -- tenant gate "$action" --env production --tenant "$tenant" ${${action:#open}:+--generate} ;;
    *) return 1 ;;
  esac
}

# desk_platform_check <restart|gate> <args json>: `ok` when the command may go ahead, else why not.
# The command's own dry run reads the live state, and platform_verdict compares it with what the
# desk sent. Run it in a command substitution.
desk_platform_check() {
  setopt local_options no_err_exit
  local -a cmd
  local out
  desk_platform_on || { print -r -- "no write credentials on $(telemetry_host)"; return 0; }
  cmd=("${(@f)$(desk_platform_argv "$1" "$2")}")
  [[ -n "${cmd[1]}" ]] || { print -r -- "bad args"; return 0; }
  out="$(desk_cdwr "${cmd[@]}" --dry-run)"
  [[ -n "$out" ]] || { print -r -- "the dry run printed nothing"; return 0; }
  watch -r --arg kind "$1" --argjson args "$2" 'include "watch"; platform_verdict($kind; $args)' <<<"$out" ||
    print -r -- "watch.jq failed$(watch_err)"
}

# desk_platform_act <restart|gate> <args json>: the write. A close's stdout holds the password, so
# it never reaches a variable: jq in the pipe keeps `.ok` and the reason alone, with the password the
# result carries replaced wherever it appears. The reason is the error message (`E`), or the
# `reason` a partial gate names its unread app with (`R`), which the gate builds from app names and
# Fly's read errors and never from the password. A gate's reason is cut at the gate key, and an error
# message is also stripped of anything shaped like a generated password, since a close that threw
# may name a password its result no longer carries. Prints the reason and returns 1 on failure. Run
# it in a command substitution.
desk_platform_act() {
  setopt local_options no_err_exit extended_glob
  local -a cmd
  local out msg src
  desk_platform_on || { print -r -- "no write credentials on $(telemetry_host)"; return 1; }
  cmd=("${(@f)$(desk_platform_argv "$1" "$2")}")
  [[ -n "${cmd[1]}" ]] || { print -r -- "bad args"; return 1; }
  # Two lines: .ok, then the reason on failure behind its source letter
  out="$(desk_cdwr "${cmd[@]}" | jq -r '
    def redact($p): if $p == "" then . else split($p) | join("…") end;
    ((.result | objects | .password | strings) // "") as $p
    | ((.result | objects | .reason | strings) // null) as $why
    | (.ok | tostring),
      (if .ok == true then ""
       elif .error then "E" + ((.error.message // "") | redact($p))
       elif .ok == false and $why then "R" + ($why | redact($p))
       elif .ok == false then "Eonly partly applied, see cdwr history on the host"
       else "" end)' 2>/dev/null)"
  [[ "${out%%$'\n'*}" == true ]] && return 0
  [[ "$out" == *$'\n'* ]] && msg=${out#*$'\n'}
  out=""
  msg=${msg%%$'\n'*}
  src=${msg[1]}
  msg=${msg[2,-1]}
  if [[ "$1" == gate ]]; then
    msg=${msg%%SITE_GATE_PASSWORD*}
    [[ "$src" == R ]] || msg=${msg//[A-Za-z0-9_-](#c20,)/…}
    msg=${msg%%[[:space:]]#}
  fi
  print -r -- "${msg[1,160]:-cdwr failed}"
  return 1
}

# A pending desk command older than this is refused as expired, never replayed: the desk-command
# function's STALE_MS, so a host back from a long silence fires no old run, pause or cap
DESK_STALE_SECS=7200
# This host's pending desk commands (the desk-command function stores them; abandon it applies
# itself), applied in id order before the pause is read, so the last one wins and a resume lifts
# the pause this tick. Each row is acked first, a PATCH on status=eq.pending, and its file changed
# only when that ack landed: of two overlapping ticks only one applies a row and writes its
# activity row, and a row whose ack failed is left as it was for the next tick. A list that can't
# be read applies nothing. --check only counts them.
apply_commands() {
  telemetry_on || return 0
  setopt local_options no_err_exit
  local host rows line id kind actor at ticket pr args value verdict why change effect body acked stamp now target ranat
  host="$(telemetry_host)"
  rows="$(supabase_select desk_commands "host=eq.$(jq -nr --arg h "$host" '$h | @uri')&status=eq.pending&kind=neq.abandon&order=id.asc&select=id,at,kind,args,actor")"
  if $check; then say "commands: $(jq 'length' <<<"$rows" 2>/dev/null || print 0) pending"; return 0; fi
  now="$(date +%s)"
  # One line per row: id, kind, actor, at in epoch seconds (0 when unreadable, so expired), ticket
  # and pr (`-` when absent: a tab is whitespace to read, so an empty field would shift the rest), the
  # args as compact JSON (never empty), value
  for line in "${(@f)$(jq -r '.[] | [.id, .kind, (.actor // "unknown"),
      (.at | tostring | sub("\\.[0-9]+"; "") | sub("\\+00(:00)?$"; "Z") | fromdateiso8601? // 0),
      (.args.ticket // "-" | tostring), (.args.pr // "-" | tostring), (.args // {} | tojson),
      (.args.value // "" | tostring)] | @tsv' <<<"$rows" 2>/dev/null)}"; do
    [[ -n "$line" ]] || continue
    IFS=$'\t' read -r id kind actor at ticket pr args value <<<"$line"
    [[ "$id" == <-> ]] || continue
    verdict=applied why="" change="" effect="" target=""
    if [[ "$at" != <-> ]] || (( now - at > DESK_STALE_SECS )); then
      verdict=refused why=expired
    else
      case "$kind" in
        pause)
          if [[ -e "$HOME_DIR/paused" ]]; then why="already paused"; else effect=pause; fi
          change="paused from the desk ($actor)" ;;
        resume)
          if [[ -e "$HOME_DIR/paused" ]]; then effect=resume; else why="not paused"; fi
          change="resumed from the desk ($actor)" ;;
        run)
          # In the container the listener woke this run; on the Mac the tick is the run. A run
          # holding the lock would make this one exit busy, so the request is refused, not lost.
          if [[ -e "$HOME_DIR/paused" ]]; then verdict=refused why=paused
          elif run_lock_live; then verdict=refused why="a run is in progress"
          else why="this run" change="run requested from the desk ($actor)"; fi ;;
        review)
          # One review an hour, whatever asked; the request is read by the next idle tick
          ranat="$(cat "$HOME_DIR/review-ran-at" 2>/dev/null)"
          if [[ "$ranat" == <-> ]] && (( now - ranat < 3600 )); then
            zmodload zsh/datetime
            verdict=refused why="a review ran at $(strftime %H:%M "$ranat")"
          elif [[ -e "$HOME_DIR/review-requested" ]]; then why="already requested"
          else effect=review change="review requested from the desk ($actor)"; fi ;;
        limit)
          if [[ "$value" == <-> ]] && (( value >= 1 && value <= 20 )); then
            effect=limit change="PR limit set to $value from the desk ($actor)"
          else verdict=refused why="bad value"; fi ;;
        cap)
          if [[ "$value" == <->(|.<->) ]] && (( value <= 500 )); then
            effect=implement-cap change="implement cap set to \$$value from the desk ($actor)"
          else verdict=refused why="bad value"; fi ;;
        copilot|merge)
          # Checked against a fresh read before the ack; the write itself follows it
          why="$(desk_pr_check "$kind" "$ticket" "$pr")"
          if [[ "$why" == ok\ * ]]; then
            target="${why#ok }" why="" effect="$kind"
            if [[ "$kind" == merge ]]; then change="PR $pr added to the merge queue from the desk ($actor)"
            else change="Copilot review requested on PR $pr from the desk ($actor)"; fi
          else verdict=refused; [[ -n "$why" ]] || why="no answer"; fi ;;
        restart|gate)
          # Checked by the command's own dry run before the ack, as the PR commands are by their read
          why="$(desk_platform_check "$kind" "$args")"
          if [[ "$why" == ok ]]; then
            why="" effect="$kind"
            if [[ "$kind" == restart ]]; then change="restarted $(jq -r '.app' <<<"$args") from the desk ($actor)"
            else change="$(jq -r '"site \(if .action == "open" then "opened" else "closed" end) for \(.tenant)"' <<<"$args") from the desk ($actor)"; fi
          else verdict=refused; [[ -n "$why" ]] || why="no answer"; fi ;;
        *) verdict=refused why="unknown kind" ;;
      esac
    fi
    [[ "$verdict" == refused ]] && change="$kind refused from the desk ($actor): $why"
    stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    body="$(jq -nc --arg s "$verdict" --arg n "$why" --arg at "$stamp" \
      '{status: $s, applied_at: $at, note: (if $n == "" then null else $n end)}')"
    acked="$(supabase_patch desk_commands "id=eq.$id&status=eq.pending" "$body")"
    if [[ "$(jq 'length' <<<"$acked" 2>/dev/null)" != 1 ]]; then
      note "desk command $id ($kind): not acked here, left to the tick that did or the next one"
      continue
    fi
    case "$effect" in
      pause) : > "$HOME_DIR/paused" ;;
      resume) rm -f "$HOME_DIR/paused" ;;
      review) : > "$HOME_DIR/review-requested" ;;
      limit|implement-cap)
        print -r -- "$value" > "$HOME_DIR/$effect.tmp" && mv "$HOME_DIR/$effect.tmp" "$HOME_DIR/$effect" ;;
    esac || { note "warn: desk command $id ($kind): acked, but $effect could not be written"; record warn "" "desk command $id: $effect not written"; }
    # A GitHub write that fails after the ack turns the row refused, with GitHub's reason
    if [[ "$effect" == (copilot|merge) ]] && ! why="$(desk_pr_act "$kind" "$pr" ${=target})"; then
      [[ -n "$why" ]] || why="GitHub refused"
      verdict=refused change="$kind refused from the desk ($actor): $why"
      supabase_patch desk_commands "id=eq.$id" "$(jq -nc --arg n "$why" '{status: "refused", note: $n}')" >/dev/null
    fi
    # Same for a restart or gate whose cdwr command fails after the ack
    if [[ "$effect" == (restart|gate) ]] && ! why="$(desk_platform_act "$kind" "$args")"; then
      [[ -n "$why" ]] || why="cdwr failed"
      verdict=refused change="$kind refused from the desk ($actor): $why"
      supabase_patch desk_commands "id=eq.$id" "$(jq -nc --arg n "$why" '{status: "refused", note: $n}')" >/dev/null
    fi
    note "desk command $id ($kind): $verdict${why:+ ($why)}"
    [[ "$ticket" == - ]] && ticket=""
    supabase_upsert activity event_id "$(jq -nc --arg id "desk:$id" --arg at "$stamp" --arg change "$change" --arg host "$host" \
      --arg ticket "$ticket" \
      '{event_id: $id, at: $at, ticket: (if $ticket == "" then null else $ticket end), actor: "human", change: $change, host: $host}')" merge
  done
  return 0
}
$platform || apply_commands

# The platform state (Fly, Infisical, the tenants' databases) as tenant_state rows, made by
# `cdwr agent platform-record`. It runs every tick, a paused one too, and in the container also
# between runs: the loop calls `run.sh --platform` every 10 minutes, which collects only when
# platform_due (no collection started in the last 5 minutes). Detached, so it can't hold up
# the tick, with a 4 minute deadline of its own (AGENT_QUEUE_PLATFORM_DEADLINE, in seconds). A
# platform.lock directory keeps two ticks from collecting at once; one older than 5 minutes lost
# its owner and is taken over. The detached wrapper writes a failure to platform-status, and the
# next tick warns about it, at most once an hour. Without the credentials it does nothing.
# It runs the code on origin/main: an unpaused tick moves the checkout under its own queue lock
# before it collects, and the --platform step moves it inside its detached part (platform_move).
# A paused tick collects with the code it has. The move is skipped while an implementing session
# runs in the checkout.
platform_warn() {
  local stamp="$HOME_DIR/platform-warned-at" last
  note "warn: platform rows: $1"
  last="$(cat "$stamp" 2>/dev/null)"
  [[ "$last" == <-> ]] || last=0
  (( $(date +%s) - last > 3600 )) || return 0
  date +%s > "$stamp"
  record warn "" "platform: $1"
}
# True unless a collection started under 5 minutes ago (platform-ran-at, epoch seconds), so a loop
# step right after a queue run doesn't read the platform twice
platform_due() {
  local last
  last="$(cat "$HOME_DIR/platform-ran-at" 2>/dev/null)"
  [[ "$last" == <-> ]] || return 0
  (( $(date +%s) - last >= 300 ))
}
# The --platform step's move to origin/main, from its detached part: under the queue lock, taken
# without waiting and dropped before the collection starts. A run holding the lock, or an
# implementing session (implement_near, checked under the lock, since a tick launches it there),
# skips the move; a warn is only noted (to_main quiet). A signal while the lock is held drops it,
# so a killed move never stops the queue.
platform_move() {
  setopt local_options local_traps
  local beat i me
  # In this detached subshell $$ is the parent's pid; the lock's owner is this process
  zmodload zsh/system
  me=$sysparams[pid]
  take_run_lock "$me" ||
    { note "platform: a run holds the lock, collecting without the move to main"; return 0; }
  # A slow install must not read as a lost collection: platform.lock stays fresh while the move
  # runs, for at most 30 minutes should this shell die without its trap
  ( for i in {1..30}; do sleep 60; touch "$HOME_DIR/platform.lock" 2>/dev/null; done ) &
  beat=$!
  trap 'kill $beat 2>/dev/null; drop_run_lock "$me"; exit 1' INT TERM HUP
  if implement_near; then
    note "platform: an implementing session runs, collecting without the move to main"
  elif git -C "$REPO" fetch -q origin 2>/dev/null; then
    to_main platform quiet
  else
    note "warn: fetch failed"
  fi
  kill $beat 2>/dev/null
  drop_run_lock "$me"
  return 0
}
# record_platform [move]: move is the --platform step's, which runs platform_move first
record_platform() {
  $check && return 0
  setopt local_options no_err_exit
  platform_on && telemetry_on || return 0
  local lockdir="$HOME_DIR/platform.lock" failed="$HOME_DIR/platform-status" deadline="${AGENT_QUEUE_PLATFORM_DEADLINE:-240}" move="${1:-}"
  if [[ -r "$failed" ]]; then
    platform_warn "$(cat "$failed")"
    rm -f "$failed"
  fi
  if [[ -d "$lockdir" && -n "$(find "$lockdir" -maxdepth 0 -mmin +5 2>/dev/null)" ]]; then
    rm -rf "$lockdir" && note "warn: cleared platform.lock; its run is gone"
  fi
  mkdir "$lockdir" 2>/dev/null || return 0
  date +%s > "$HOME_DIR/platform-ran-at"
  rm -f "$HOME_DIR/platform-timeout"
  ( cd "$REPO" || { rmdir "$lockdir"; exit 0; }
    # The deadline and the 5-minute takeover of platform.lock count from the end of the move
    [[ "$move" == move ]] && { platform_move; touch "$lockdir"; }
    FLY_API_TOKEN="$FLY_API_TOKEN" PLATFORM_DATABASE_URL="$PLATFORM_DATABASE_URL" \
      PLATFORM_INFISICAL_CLIENT_ID="${PLATFORM_INFISICAL_CLIENT_ID:-}" \
      PLATFORM_INFISICAL_CLIENT_SECRET="${PLATFORM_INFISICAL_CLIENT_SECRET:-}" \
      PLATFORM_INFISICAL_PROJECT_ID="${PLATFORM_INFISICAL_PROJECT_ID:-}" \
      PLATFORM_SENTRY_AUTH_TOKEN="${PLATFORM_SENTRY_AUTH_TOKEN:-}" \
      PLATFORM_SENTRY_ORG="${PLATFORM_SENTRY_ORG:-}" \
      PLATFORM_UMAMI_URL="${PLATFORM_UMAMI_URL:-}" \
      PLATFORM_UMAMI_API_KEY="${PLATFORM_UMAMI_API_KEY:-}" \
      AGENT_QUEUE_HOME="$HOME_DIR" \
      AGENT_SUPABASE_URL="$AGENT_SUPABASE_URL" AGENT_SUPABASE_SERVICE_KEY="$AGENT_SUPABASE_SERVICE_KEY" \
      node tools/cdwr/bin/cdwr.mjs agent platform-record --yes --json >/dev/null 2>&1 </dev/null &
    cpid=$!
    ( sleep "$deadline"; : > "$HOME_DIR/platform-timeout"; kill -TERM $cpid 2>/dev/null ) &
    watchdog=$!
    wait $cpid
    rc=$?
    kill $watchdog 2>/dev/null
    if [[ -e "$HOME_DIR/platform-timeout" ]]; then
      rm -f "$HOME_DIR/platform-timeout"
      print -r -- "cdwr agent platform-record timed out after ${deadline}s" > "$failed"
    elif (( rc != 0 )); then
      print -r -- "cdwr agent platform-record failed ($rc)" > "$failed"
    fi
    rmdir "$lockdir" 2>/dev/null ) &!
  return 0
}
# Between runs: no desk commands, no pause, no queue lock
if $platform; then
  platform_due && record_platform move
  exit 0
fi

# A nightly dump of the cms database into $HOME_DIR/backups, made by `cdwr agent backup`. It runs
# every tick, a paused one too, but starts only once a day: from 02:00 local time, when
# backup-ran-on does not already name today (written at the start, so a failing night is not retried
# every tick; the desk's stale-backup problem covers it). AGENT_QUEUE_BACKUP_HOUR stands in for the
# local hour in tests. Detached with a deadline of its own (AGENT_QUEUE_BACKUP_DEADLINE, in
# seconds, default 15 minutes); a backup.lock directory keeps two runs apart and one older than 20
# minutes is taken over. The detached wrapper writes a failure to backup-failed, and the next tick
# warns about it, at most once an hour. It writes no telemetry, so it needs no Supabase key.
# Without PLATFORM_BACKUP_DATABASE_URL it does nothing.
backup_warn() {
  local stamp="$HOME_DIR/backup-warned-at" last
  note "warn: backup: $1"
  last="$(cat "$stamp" 2>/dev/null)"
  [[ "$last" == <-> ]] || last=0
  (( $(date +%s) - last > 3600 )) || return 0
  date +%s > "$stamp"
  record warn "" "backup: $1"
}
record_backup() {
  $check && return 0
  setopt local_options no_err_exit
  [[ -n "${PLATFORM_BACKUP_DATABASE_URL:-}" ]] || return 0
  local lockdir="$HOME_DIR/backup.lock" failed="$HOME_DIR/backup-failed" deadline="${AGENT_QUEUE_BACKUP_DEADLINE:-900}" hour today
  if [[ -r "$failed" ]]; then
    backup_warn "$(cat "$failed")"
    rm -f "$failed"
  fi
  hour="${AGENT_QUEUE_BACKUP_HOUR:-$(date +%H)}"
  [[ "$hour" == <-> ]] || return 0
  (( 10#$hour >= 2 )) || return 0
  today="$(date +%F)"
  [[ "$(cat "$HOME_DIR/backup-ran-on" 2>/dev/null)" == "$today" ]] && return 0
  if [[ -d "$lockdir" && -n "$(find "$lockdir" -maxdepth 0 -mmin +20 2>/dev/null)" ]]; then
    rm -rf "$lockdir" && note "warn: cleared backup.lock; its run is gone"
  fi
  mkdir "$lockdir" 2>/dev/null || return 0
  print -r -- "$today" > "$HOME_DIR/backup-ran-on"
  rm -f "$HOME_DIR/backup-timeout"
  note "backup: started"
  ( cd "$REPO" || { rmdir "$lockdir"; exit 0; }
    PLATFORM_BACKUP_DATABASE_URL="$PLATFORM_BACKUP_DATABASE_URL" AGENT_QUEUE_HOME="$HOME_DIR" \
      node tools/cdwr/bin/cdwr.mjs agent backup --yes --json >/dev/null 2>&1 </dev/null &
    cpid=$!
    ( sleep "$deadline"; : > "$HOME_DIR/backup-timeout"; kill -TERM $cpid 2>/dev/null ) &
    watchdog=$!
    wait $cpid
    rc=$?
    kill $watchdog 2>/dev/null
    if [[ -e "$HOME_DIR/backup-timeout" ]]; then
      rm -f "$HOME_DIR/backup-timeout"
      print -r -- "cdwr agent backup timed out after ${deadline}s" > "$failed"
    elif (( rc != 0 )); then
      print -r -- "cdwr agent backup failed ($rc)" > "$failed"
    fi
    rmdir "$lockdir" 2>/dev/null ) &!
  return 0
}

# A pause is deliberate: the tick takes no lock and still checks in ok, so the monitor does not
# alert. It publishes its queue state below, once that can be written.
paused=false
if [[ -e "$HOME_DIR/paused" ]] && ! $check; then paused=true; fi
fetched=false
if ! $paused; then
  if ! take_run_lock $$; then say "busy: a run is in progress"; exit 0; fi
  trap 'drop_run_lock $$' EXIT
  # Under the lock, so no claude run is mid-flight on the checkout: the collection runs main's code
  if ! $check && platform_on && telemetry_on; then
    if implement_near; then
      note "platform: an implementing session runs, collecting without the move to main"
    elif git -C "$REPO" fetch -q origin 2>/dev/null; then
      fetched=true
      to_main platform
    else
      note "warn: fetch failed"
    fi
  fi
fi
record_platform
record_backup
CHECKIN_ID=""

source "${0:A:h}/lib.sh"
source "${0:A:h}/waits.sh"

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
  for f in run.sh lib.sh waits.sh watch.jq implement.sh github-app.sh notify.sh checkin.sh telemetry.sh deploy-gate.sh linear-tools.txt hold-paths.txt; do
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
# The daily implement cap in dollars: the file the desk sets, then the env, then 40; null when the setting is not a number
implement_cap() {
  local cap
  cap="$(tr -d '[:space:]' 2>/dev/null < "$HOME_DIR/implement-cap" || true)"
  [[ "$cap" == <->(|.<->) ]] || cap="${AGENT_QUEUE_IMPLEMENT_CAP_USD:-40}"
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
  local last attended suggested jl view watch renovate devlog review deploy
  last="$(date '+%F %H:%M') · $last_outcome${launch_note:+ · no launch: $launch_note}"
  # attended-published is the cache before attended-line, until a verdict replaces it
  attended="${attended_line:-$(cat "$HOME_DIR/attended-line" 2>/dev/null || cat "$HOME_DIR/attended-published" 2>/dev/null)}"
  suggested="$(cat "$HOME_DIR/suggested-line" 2>/dev/null)"
  jl="$(queue_job_line)"
  view="${queue_view:-$(cat "$HOME_DIR/queue-view.json" 2>/dev/null)}"
  watch="$(cat "$HOME_DIR/watch.json" 2>/dev/null)"
  renovate="$(cat "$HOME_DIR/renovate.json" 2>/dev/null)"
  devlog="$(cat "$HOME_DIR/devlog-line" 2>/dev/null)"
  review="$(cat "$HOME_DIR/review-line" 2>/dev/null)"
  deploy="$(cat "$HOME_DIR/deploy.json" 2>/dev/null)"
  ( telemetry_queue_state "$last" "$attended" "$suggested" "$jl" "$view" "$watch" "$renovate" "$devlog" "$review" "$deploy" ) &!
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

linear_auth || { say "skip: no Linear credentials (AGENT_QUEUE_LINEAR_CLIENT_ID and _SECRET, the Keychain items linear-agent-queue-client-id and -client-secret, or the key AGENT_QUEUE_LINEAR_KEY / Keychain linear-agent-queue)"; exit 0; }
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
          id createdAt actor { id name app } botActor { name type }
          fromState { name } toState { name }
          addedLabels { name } removedLabels { name } updatedDescription
        }
      }
      comments(first: 50) { nodes { id createdAt body user { id name app } botActor { name type } } }
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
  rm -f "$LOGS/gh-read-fallback.$$" "$LOGS/watch.$$.err" "$LOGS/renovate.$$.err"
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
  drop_run_lock $$
  if ! $check; then
    if (( st == 0 )); then checkin ok "$CHECKIN_ID"; else checkin error "$CHECKIN_ID"; fi
  fi
  return 0
}
trap 'st=$?; on_exit $st; exit $st' EXIT
# Opened only once on_exit can close it; earlier skips send nothing, so a missing key shows as missed check-ins
$check || CHECKIN_ID="$(checkin in_progress)"

# PR watch: only reads (gh pr list, gh api graphql with a query), as the app or else Håkan.
# The decisions live in watch.jq, installed next to this file. It watches every ticket an agent
# label still claims, since Håkan may merge from a gate; RELABEL is its one Linear write. The
# scheduler's other write is the parent close after it (CLOSE_PARENT, CLOSE_COMMENT). Its only
# GitHub writes are the desk's copilot and merge commands (desk_pr_act), the watch's own Copilot
# request for a ticket parked on Copilot (copilot_request), since the ruleset's automatic review
# skips a PR the app opened, and the watch's own merge enqueue (desk_pr_act merge) for a PR on no
# hold path (hold-paths.txt, watch.jq merge_verdict). All go as the app, the Copilot request then
# as AGENT_COPILOT_TOKEN. After such a merge it reads the production deploy (read_deploy).
# Paged, since done tickets keep agent:review for 14 days and alone fill a page.
read -r -d '' WATCHED <<'GQL' || true
query($after: String) {
  issues(first: 100, after: $after, filter: {
    team: { key: { eq: "COD" } }
    labels: { some: { name: { in: ["agent:working", "agent:needs-input", "agent:review"] } } }
    state: { type: { neq: "canceled" } }
    or: [{ completedAt: { null: true } }, { completedAt: { gt: "-P14D" } }]
  }) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      identifier
      description
      labels { nodes { id name } }
      attachments { nodes { url createdAt } }
      comments(last: 50, orderBy: createdAt) { nodes { id body createdAt user { id app } } }
    }
  }
}
GQL
# Read once, not on every page of WATCHED
read -r -d '' WATCH_LABELS <<'GQL' || true
query {
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
# PR_QUERY, watch, watch_err and gh_identity sit above apply_commands, which uses them too.

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
    { local why="$(watch_err)"; note "warn: watch: watch.jq failed relabelling $id$why"; record warn "$id" "watch: relabel failed$why"; return 1; }
  resp="$(linear "$RELABEL" "$vars")"
  if ! jq -e '.data.issueUpdate.success == true' >/dev/null 2>&1 <<<"$resp"; then
    note "warn: watch: relabel of $id failed ($(jq -c '.errors[0].message // "no answer"' <<<"$resp" 2>/dev/null))"
    record warn "$id" "watch: relabel failed"
    return 1
  fi
  note "watch: $id merged outside review, relabelled agent:review"
}

# read_deploy <entry json> [ticket]: the production deploy of a PR the watch merged on its own (an
# entry with autoMerge, merged, a merge commit and no settled deploy). Reads the Fly Deployment push
# runs of the merge commit and, once the newest one succeeded, the annotations of its jobs, and
# prints { state, run, at } from watch.jq deploy_state. Prints nothing when there is nothing to read
# or a read failed: the deploy stays as it was, with one warn.
# The hold list and the deploy reads fail every tick while they fail: noted each time, one warn row
# an hour, as activity_warn, so a lasting failure can't push real rows out of runs.jsonl
hold_list_warn() {
  local stamp="$HOME_DIR/hold-paths-warned-at" last
  note "warn: watch: hold-paths.txt not read, no PR merges on its own"
  last="$(cat "$stamp" 2>/dev/null)"
  [[ "$last" == <-> ]] || last=0
  (( $(date +%s) - last > 3600 )) || return 0
  date +%s > "$stamp"
  record warn "" "watch: hold-paths.txt not read"
}
deploy_warn() {
  local stamp="$HOME_DIR/deploy-warned-at" last
  last="$(cat "$stamp" 2>/dev/null)"
  [[ "$last" == <-> ]] || last=0
  (( $(date +%s) - last > 3600 )) || return 0
  date +%s > "$stamp"
  record warn "$1" "watch: could not read the deploy"
}
read_deploy() {
  setopt local_options no_err_exit
  local entry="$1" id="${2:-}" sha runs newest rid jobs job notes="$HOME_DIR/watch-notes.jsonl" state
  jq -e '(.autoMerge.tries // 0) >= 1 and .state == "merged" and .mergeCommit != null
    and ((.deploy.state // "pending") == "pending")' >/dev/null 2>&1 <<<"$entry" || return 0
  sha="$(jq -r '.mergeCommit' <<<"$entry")"
  runs="$(gh_read gh api "repos/codeware-sthlm/cdwr/actions/workflows/fly-deployment.yml/runs?head_sha=$sha&event=push" 2>/dev/null)" ||
    { note "warn: watch: could not read the deploy of $sha ($id)"; deploy_warn "$id"; return 0; }
  newest="$(jq -c '[.workflow_runs[]?] | sort_by(.created_at // "") | last' <<<"$runs" 2>/dev/null)" ||
    { note "warn: watch: unreadable deploy runs for $sha ($id)"; deploy_warn "$id"; return 0; }
  : > "$notes"
  if [[ "$(jq -r '.status == "completed" and .conclusion == "success"' <<<"$newest")" == true ]]; then
    rid="$(jq -r '.id' <<<"$newest")"
    jobs="$(gh_read gh api "repos/codeware-sthlm/cdwr/actions/runs/$rid/jobs?per_page=100" 2>/dev/null)" ||
      { rm -f "$notes"; note "warn: watch: could not read the deploy jobs of $sha ($id)"; deploy_warn "$id"; return 0; }
    for job in ${(f)"$(jq -r '.jobs[]?.id' <<<"$jobs")"}; do
      gh_read gh api "repos/codeware-sthlm/cdwr/check-runs/$job/annotations" 2>/dev/null >> "$notes" ||
        { rm -f "$notes"; note "warn: watch: could not read the deploy annotations of $sha ($id)"; deploy_warn "$id"; return 0; }
    done
  fi
  state="$(watch -rn --argjson runs "$runs" --slurpfile notes "$notes" --arg merged "$(jq -r '.mergedAt // ""' <<<"$entry")" \
    --argjson now "$(date +%s)" 'include "watch";
    deploy_state($runs; ($notes | add // []); (if $merged == "" then null else $merged end); $now)')"
  rm -f "$notes"
  [[ -n "$state" ]] || { note "warn: watch: deploy_state failed for $sha ($id)$(watch_err)"; deploy_warn "$id"; return 0; }
  jq -nc --arg s "$state" --argjson r "$newest" --arg at "$(date -u +%FT%TZ)" \
    '{state: $s, run: ($r.html_url // null), at: $at}'
}

watch_prs() {
  # One PR failing to read skips that PR, not the rest.
  setopt local_options no_err_exit
  local file="$HOME_DIR/watch.json" pages="$HOME_DIR/watch-pages.jsonl" after=null page
  local resp nodes state node id label pr now out level msg review why asked ok holds nodeid oid deploy
  gh_identity_or_note
  # The hold list sits beside watch.jq. Unread, no PR merges on its own
  holds="$(watch -Rsc 'include "watch"; hold_globs' 2>/dev/null < "$WATCH_DIR/hold-paths.txt")" || holds=null
  # An empty list is a broken install, not a licence: it reads as unread
  [[ -n "$holds" && "$holds" != "[]" ]] || holds=null
  [[ "$holds" == null ]] && hold_list_warn
  # Every page up to 5, through a file as in record_activity; only tickets past the cap go unwatched
  : > "$pages"
  for page in {1..5}; do
    resp="$(linear "$WATCHED" "$(jq -nc --argjson a "$after" '{after: $a}')")" ||
      { print -r -- "Linear did not answer"; return 1; }
    jq -e '.data.issues.nodes' >/dev/null <<<"$resp" 2>/dev/null ||
      { print -r -- "Linear error $(jq -c '.errors[0].message' <<<"$resp" 2>/dev/null)"; return 1; }
    jq -c '.data.issues.nodes' <<<"$resp" >> "$pages"
    [[ "$(jq -r '.data.issues.pageInfo.hasNextPage' <<<"$resp")" == true ]] || break
    after="$(jq -c '.data.issues.pageInfo.endCursor' <<<"$resp")"
    (( page == 5 )) &&
      { note "warn: watch: more than 5 pages of tickets, the rest not watched"; record warn "" "watch: page limit reached"; }
  done
  # Same repo rule as planning: tickets labelled for another repo have no PR here.
  # A ticket on two pages is watched once.
  nodes="$(jq -cs --argjson other "$OTHER_REPOS" '[add[]
    | select((.labels.nodes | map(.name | IN($other[])) | any) | not)] | unique_by(.identifier)' "$pages")"
  rm -f "$pages"
  # A missing or broken state file counts as empty; tickets no longer watched drop out.
  state="$(jq -c 'if type == "object" then . else {} end' "$file" 2>/dev/null || print '{}')"
  state="$(watch -c --argjson ids "$(jq -c 'map(.identifier)' <<<"$nodes")" \
    'include "watch"; prune($ids)' <<<"$state")" || { print -r -- "watch.jq failed$(watch_err)"; return 1; }
  # The team's own agent:review label before a workspace one. Unread, it stays empty and
  # relabel_merged warns for each ticket it would relabel.
  resp="$(linear "$WATCH_LABELS")"
  jq -e '.data.issueLabels.nodes' >/dev/null <<<"$resp" 2>/dev/null ||
    note "warn: watch: the agent:review label was not read ($(jq -c '.errors[0].message // "no answer"' <<<"$resp" 2>/dev/null))"
  review="$(jq -r '[.data.issueLabels.nodes[]? | select(.team == null or .team.key == "COD")]
    | sort_by(.team == null) | first | .id // empty' <<<"$resp" 2>/dev/null)"

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
    # A renovate ticket carries Renovate's PR until its own PR opens: that one is not the ticket's
    if [[ "$(jq -r '.headRefName // ""' <<<"$now")" == renovate/* ]]; then
      state="$(jq -c --arg id "$id" 'del(.[$id])' <<<"$state")"
      continue
    fi
    out="$(watch -cn --arg id "$id" --arg agentLabel "$label" --argjson pr "$pr" --argjson node "$node" --argjson now "$now" \
      --argjson state "$state" --argjson holds "$holds" --arg at "$(date -u +%FT%TZ)" '
      include "watch";
      {id: $id, agentLabel: $agentLabel, pr: $pr, now: ($now | pr_state), prev: $state[$id],
       handoffs: ($node | handoffs), parked: ($node | parked), at: $at,
       apply: ($node | apply_input), left: ($node | checklist_handoffs), mergedAt: ($now.mergedAt // null),
       merge: (if $holds == null then null else ($now | merge_verdict($node; $holds)) end)} | step')" ||
      { why="$(watch_err)"; note "warn: watch: watch.jq failed on $id$why"; record warn "$id" "watch: watch.jq failed$why"; continue; }
    while IFS=$'\t' read -r level msg; do
      [[ -z "$level" ]] && continue
      note "watch: $level $msg"
      notice "$level" "$msg"
    done <<<"$(jq -r '.notices[] | "\(.level)\t\(.message)"' <<<"$out")"
    # GitHub's automatic review skips a PR the app opened, so a ticket parked on Copilot gets one
    # request per PR from here (step's askCopilot). The outcome stays on the entry and a failed try
    # is never repeated: Håkan has the desk's Copilot button for it.
    if [[ "$(jq -r '.askCopilot' <<<"$out")" == true ]]; then
      ok=true
      why="$(copilot_request "$pr")" || ok=false
      asked="$(jq -nc --arg at "$(date -u +%FT%TZ)" --argjson ok "$ok" --arg why "$why" \
        '{at: $at, ok: $ok, why: (if $ok or $why == "" then null else $why end)}')"
      out="$(jq -c --argjson a "$asked" '.entry.copilotAsked = $a | if $a.ok then .entry.copilot = "requested" else . end' <<<"$out")"
      if $ok; then
        note "watch: $id Copilot requested on PR #$pr"
      else
        msg="$id: could not request Copilot on PR $pr: ${why:-GitHub refused}"
        note "watch: action $msg"
        notice action "$msg"
      fi
    fi
    # The merge: step says enqueue only when merge_verdict said ok on this very node, so its node id
    # and head oid go to GitHub as they were read. A refusal stores autoMergeFailed in place of
    # autoMerge, so that head is not tried again.
    if [[ "$(jq -r '.enqueue' <<<"$out")" == true ]]; then
      nodeid="$(jq -r '.id' <<<"$now")"
      oid="$(jq -r '.headRefOid' <<<"$now")"
      if why="$(desk_pr_act merge "$pr" "$nodeid" "$oid")"; then
        note "watch: $id PR #$pr merging on its own"
        notice info "$id: PR $pr merging on its own"
        record auto-merge "$id" "PR $pr enqueued"
      else
        out="$(jq -c '.entry.autoMerge = .autoMergeFailed' <<<"$out")"
        msg="$id: PR $pr could not join the merge queue: ${why:-GitHub refused}"
        note "watch: action $msg"
        notice action "$msg"
      fi
    fi
    if [[ "$(jq -r '.relabel' <<<"$out")" == true ]]; then
      relabel_merged "$node" "$(jq -r '.mergedAt // empty' <<<"$now")" "$review" &&
        out="$(jq -c '.entry.relabelled = true' <<<"$out")"
    fi
    # After a self-merge, the production deploy of the merge commit
    deploy="$(read_deploy "$(jq -c '.entry' <<<"$out")" "$id")"
    [[ -n "$deploy" ]] && out="$(jq -c --argjson d "$deploy" '.entry.deploy = $d' <<<"$out")"
    state="$(jq -c --arg id "$id" --argjson e "$(jq -c '.entry' <<<"$out")" '.[$id] = $e' <<<"$state")"
  done

  print -r -- "$state" > "$file.tmp" && mv "$file.tmp" "$file"
}

# The apply list (README, "Apply list"): the items of the agent's PR-ready comment that step stored
# in watch.json at the merge, applied here in order with the desk's write credentials. Each item's
# arguments must match a closed pattern again here (apply_argv), whatever the session checked: the
# list is the only thing that crosses from a session to these credentials. Each goes through its
# command's dry run (apply_verdict), then the real call, and is ticked in the comment with its
# outcome. The first refusal stops the list. An item waits while the checkout lacks the merge, and
# an after-deploy one until the production deploy of the merge commit finished, at most
# APPLY_WAIT_SECS after the merge was seen.
APPLY_WAIT_SECS=10800
read -r -d '' COMMENT_READ <<'GQL' || true
query($id: String!) { comment(id: $id) { body } }
GQL
read -r -d '' COMMENT_UPDATE <<'GQL' || true
mutation($id: String!, $body: String!) { commentUpdate(id: $id, input: { body: $body }) { success } }
GQL

apply_app() { [[ "$1" == cdwr-cms || "$1" == cdwr-(cms|headless)-[a-z0-9][a-z0-9-]# ]]; }

# apply_argv <item json>: the cdwr arguments, one per line, and nothing for the kinds that run no
# command. Returns 1 when the kind or an argument breaks the vocabulary.
apply_argv() {
  setopt local_options no_err_exit extended_glob
  local kind n a1 a2
  kind="$(jq -r '.kind // ""' <<<"$1" 2>/dev/null)"
  n="$(jq -r '.args | length' <<<"$1" 2>/dev/null)"
  a1="$(jq -r '.args[0] // ""' <<<"$1" 2>/dev/null)"
  a2="$(jq -r '.args[1] // ""' <<<"$1" 2>/dev/null)"
  case "$kind" in
    restart) [[ "$n" == 1 ]] && apply_app "$a1" && print -rl -- fly restart "$a1" ;;
    scale) [[ "$n" == 2 && "$a2" == [1-4] ]] && apply_app "$a1" && print -rl -- fly scale "$a1" "$a2" ;;
    deploy-workflow)
      [[ "$n" == 2 && "$a2" == production && "$a1" == [a-z0-9][a-z0-9-]# ]] &&
        jq -e --arg p "$a1" '.release.groups.apps.projects | index($p) != null' "$REPO/nx.json" >/dev/null 2>&1 &&
        print -rl -- fly deploy "$a1" --env production ;;
    supabase-migration)
      [[ "$n" == 1 && "$a1" == tools/cdwr/agent-queue/supabase/migrations/[0-9](#c14)_[a-z0-9_]##.sql ]] &&
        print -rl -- agent supabase-migrate "$a1" ;;
    supabase-function)
      [[ "$n" == 1 && "$a1" == [a-z0-9][a-z0-9-]# && -d "$REPO/tools/cdwr/agent-queue/supabase/functions/$a1" ]] ;;
    agent-deploy|nuc-install) [[ "$n" == 0 ]] ;;
    *) return 1 ;;
  esac
}

# apply_cdwr <kind> <cdwr args>...: the call with the one credential its kind uses. Restart and
# scale go through desk_cdwr, as the desk's restart does; the others name every desk credential
# empty, so dotenv fills none in from tools/cdwr/.env.
apply_cdwr() {
  local kind=$1; shift
  case "$kind" in
    restart|scale) desk_cdwr "$@" ;;
    deploy-workflow)
      ( gh_identity || exit 1
        cd "$REPO" && FLY_API_TOKEN="" FLY_ACCESS_TOKEN="" INFISICAL_SERVICE_TOKEN="" \
          node tools/cdwr/bin/cdwr.mjs "$@" --yes --json 2>/dev/null </dev/null ) ;;
    supabase-migration)
      ( cd "$REPO" && AGENT_SUPABASE_DB_URL="$DESK_SUPABASE_DB_URL" FLY_API_TOKEN="" FLY_ACCESS_TOKEN="" \
          INFISICAL_SERVICE_TOKEN="" node tools/cdwr/bin/cdwr.mjs "$@" --yes --json 2>/dev/null </dev/null ) ;;
    *) return 1 ;;
  esac
}

# apply_deploy_state <sha>: `ok`, `wait` or `failed` for the fly-deployment.yml run of the merge
# commit, read as the app. A run that skipped the app is ok. Run it in a command substitution.
apply_deploy_state() {
  setopt local_options no_err_exit
  local runs
  gh_identity || { print -r -- wait; return 0; }
  runs="$(gh api "repos/codeware-sthlm/cdwr/actions/workflows/fly-deployment.yml/runs?head_sha=$1&per_page=5" \
    --jq '[.workflow_runs[] | {status, conclusion}] | first // {}' 2>/dev/null)" || { print -r -- wait; return 0; }
  # A run cancelled by a newer push waits: the newer deploy carries the merge, within the time limit
  jq -r 'if .status != "completed" or .conclusion == "cancelled" then "wait"
    elif (.conclusion | IN("success", "skipped")) then "ok" else "failed" end' <<<"$runs" 2>/dev/null || print -r -- wait
}

# apply_self_deploy <sha>: the agent-deploy item from the self-deploy's deploy.json: `ok <tag>`
# once a healthy deploy runs the merge commit or a newer one, `refused <why>`, or `wait`
apply_self_deploy() {
  setopt local_options no_err_exit
  local phase tag
  [[ -r "$HOME_DIR/deploy.json" ]] || { print -r -- "refused no self-deploy on this host"; return 0; }
  phase="$(jq -r '.phase // ""' "$HOME_DIR/deploy.json" 2>/dev/null)"
  tag="$(jq -r '.tag // ""' "$HOME_DIR/deploy.json" 2>/dev/null)"
  [[ "$tag" == sha-[0-9a-f](#c7,40) ]] || { print -r -- wait; return 0; }
  git -C "$REPO" merge-base --is-ancestor "$1" "${tag#sha-}" 2>/dev/null || { print -r -- wait; return 0; }
  case "$phase" in
    ok) print -r -- "ok $tag" ;;
    roll*|stuck|fail*) print -r -- "refused self-deploy of $tag: $phase" ;;
    *) print -r -- wait ;;
  esac
}

# apply_nuc <sha>: the nuc-install item from nuc-apply.json, which the host's nuc-sync.sh records
# through deploy-gate.sh: `ok <short sha>` once nuc-apply ran clean on a main that contains the merge
# commit, `refused <why>`, or `wait`. Its `main` is the head the applied folder commit was read at.
apply_nuc() {
  setopt local_options no_err_exit
  local file="$HOME_DIR/nuc-apply.json" phase sha main
  [[ -r "$file" ]] || { print -r -- "refused no nuc-apply on this host"; return 0; }
  phase="$(jq -r '.phase // ""' "$file" 2>/dev/null)"
  sha="$(jq -r '.sha // ""' "$file" 2>/dev/null)"
  main="$(jq -r '.main // ""' "$file" 2>/dev/null)"
  [[ "$sha" == [0-9a-f](#c40) && "$main" == [0-9a-f](#c40) ]] || { print -r -- wait; return 0; }
  git -C "$REPO" merge-base --is-ancestor "$1" "$main" 2>/dev/null || { print -r -- wait; return 0; }
  case "$phase" in
    ok) print -r -- "ok ${sha[1,7]}" ;;
    failed) print -r -- "refused nuc-apply of ${sha[1,7]}: failed" ;;
    *) print -r -- wait ;;
  esac
}

# apply_item <entry json> <item json>: one item. Prints `wait`, `applied <outcome>` or
# `refused <why>`. Run it in a command substitution.
apply_item() {
  setopt local_options no_err_exit extended_glob
  local entry=$1 item=$2 kind sha seen now out ok verdict state
  local -a cmd
  kind="$(jq -r '.kind' <<<"$item")"
  sha="$(jq -r '.apply.sha // ""' <<<"$entry")"
  [[ "$sha" == [0-9a-f](#c40) ]] || { print -r -- "refused no merge commit"; return 0; }
  # The merged code runs the item: a scale or a migration may only exist from this merge on
  git -C "$REPO" merge-base --is-ancestor "$sha" HEAD 2>/dev/null || { print -r -- wait; return 0; }
  seen="$(jq -r '.apply.at // "" | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601? // 0' <<<"$entry")"
  now="$(date +%s)"
  if [[ "$(jq -r '.afterDeploy' <<<"$item")" == true ]]; then
    state="$(apply_deploy_state "$sha")"
    [[ "$state" == failed ]] && { print -r -- "refused production deploy failed"; return 0; }
    if [[ "$state" != ok ]]; then
      (( now - seen > APPLY_WAIT_SECS )) && { print -r -- "refused no production deploy within 3 hours"; return 0; }
      print -r -- wait; return 0
    fi
  fi
  case "$kind" in
    supabase-function) print -r -- "refused not enabled"; return 0 ;;
    agent-deploy)
      out="$(apply_self_deploy "$sha")"
      if [[ "$out" == ok\ * ]]; then print -r -- "applied deployed ${out#ok }"
      elif [[ "$out" == wait ]] && (( now - seen > APPLY_WAIT_SECS )); then print -r -- "refused no self-deploy within 3 hours"
      else print -r -- "$out"; fi
      return 0 ;;
    nuc-install)
      out="$(apply_nuc "$sha")"
      if [[ "$out" == ok\ * ]]; then print -r -- "applied installed ${out#ok }"
      elif [[ "$out" == wait ]] && (( now - seen > APPLY_WAIT_SECS )); then print -r -- "refused no nuc-apply within 3 hours"
      else print -r -- "$out"; fi
      return 0 ;;
    # Restart and scale read no Infisical, so the Fly token is all they need
    restart|scale) [[ -n "${DESK_FLY_TOKEN:-}" ]] || { print -r -- "refused no DESK_FLY_TOKEN on $(telemetry_host)"; return 0; } ;;
    supabase-migration)
      [[ -n "${DESK_SUPABASE_DB_URL:-}" ]] || { print -r -- "refused no DESK_SUPABASE_DB_URL on $(telemetry_host)"; return 0; }
      # The checkout moves on with main: the file must still read as it was merged
      git -C "$REPO" diff --quiet "$sha" HEAD -- "$(jq -r '.args[0]' <<<"$item")" 2>/dev/null ||
        { print -r -- "refused the file changed after the merge"; return 0; } ;;
    deploy-workflow) ( gh_identity ) || { print -r -- "refused no GitHub app"; return 0; } ;;
  esac
  cmd=("${(@f)$(apply_argv "$item")}")
  [[ -n "${cmd[1]}" ]] || { print -r -- "refused bad args"; return 0; }
  out="$(apply_cdwr "$kind" "${cmd[@]}" --dry-run)"
  [[ -n "$out" ]] || { print -r -- "refused the dry run printed nothing"; return 0; }
  verdict="$(watch -r --argjson item "$item" 'include "watch"; apply_verdict($item)' <<<"$out")" ||
    verdict="watch.jq failed$(watch_err)"
  [[ "$verdict" == already\ <-> ]] && { print -r -- "applied $verdict"; return 0; }
  [[ "$verdict" == ok ]] || { print -r -- "refused ${verdict%%$'\n'*}"; return 0; }
  # Only .ok, the run url and the error message leave the call, on one line each
  out="$(apply_cdwr "$kind" "${cmd[@]}" | jq -r '(.ok | tostring),
    (if .ok == true then (.result | objects | .runUrl | strings) // "" else (.error.message // "cdwr failed") end
     | gsub("[\\r\\n]+"; " "))' 2>/dev/null)"
  # $( ) drops an empty second line, so `true` may be the whole of it
  ok="${out%%$'\n'*}"
  [[ "$out" == *$'\n'* ]] && out="${out#*$'\n'}" || out=""
  if [[ "$ok" == true ]]; then
    print -r -- "applied $(date -u +%Y-%m-%dT%H:%MZ)${out:+, $out}"
  else
    out="${out//·/-}"
    print -r -- "refused ${${out:-cdwr failed}[1,160]}"
  fi
}

# apply_tick <comment id> <spec> <outcome> <ticked>: the item's line in the comment, rewritten by
# apply_mark. True only when Linear took it.
apply_tick() {
  local vars resp
  vars="$(linear "$COMMENT_READ" "$(jq -nc --arg id "$1" '{id: $id}')" |
    watch -c --arg id "$1" --arg s "$2" --arg o "$3" --argjson t "$4" \
      'include "watch"; .data.comment.body // error("no comment") | {id: $id, body: apply_mark($s; $o; $t)}')" || return 1
  resp="$(linear "$COMMENT_UPDATE" "$vars")"
  jq -e '.data.commentUpdate.success == true' >/dev/null 2>&1 <<<"$resp"
}

# apply_list <id> <entry json>: works the ticket's list as far as it goes this tick and prints the
# entry with its apply updated. Sends the summary notice once the list is done.
apply_list() {
  setopt local_options no_err_exit extended_glob
  local id=$1 entry=$2 pr item spec i n res st outcome bad added summary sha ticked
  pr="$(jq -r '.pr' <<<"$entry")"
  # The whole list is checked once, before anything runs: one item outside the vocabulary, or a
  # migration the merged PR did not add, and nothing from it is applied. Checked against the merged
  # checkout, and tried again next tick while that or the PR's files can't be read; without a merge
  # commit apply_item refuses the first item.
  sha="$(jq -r '.apply.sha // ""' <<<"$entry")"
  if [[ "$(jq -r '.apply.checked // false' <<<"$entry")" != true && "$sha" == [0-9a-f](#c40) ]]; then
    bad=""
    git -C "$REPO" merge-base --is-ancestor "$sha" HEAD 2>/dev/null || { print -r -- "$entry"; return 0; }
    added="$( ( gh_identity && gh api --paginate "repos/codeware-sthlm/cdwr/pulls/$pr/files" \
      --jq '.[] | select(.status == "added") | .filename' ) 2>/dev/null )" ||
      { print -r -- "$entry"; return 0; }
    for item in ${(f)"$(jq -c '.apply.items[]' <<<"$entry")"}; do
      spec="$(jq -r '.spec' <<<"$item")"
      apply_argv "$item" >/dev/null || { bad="$spec: not in the vocabulary"; break; }
      if [[ "$(jq -r '.kind' <<<"$item")" == supabase-migration ]] &&
        ! (( ${${(f)added}[(Ie)$(jq -r '.args[0]' <<<"$item")]} )); then
        bad="$spec: PR $pr did not add it"; break
      fi
    done
    entry="$(jq -c --arg bad "$bad" '.apply.checked = true
      | if $bad != "" then .apply.invalid = $bad | .apply.done = true else . end' <<<"$entry")"
  fi
  n="$(jq '.apply.items | length' <<<"$entry")"
  # A tick Linear did not take is tried again, never the item itself
  for (( i = 0; i < n; i++ )); do
    item="$(jq -c --argjson i "$i" '.apply.items[$i]' <<<"$entry")"
    [[ "$(jq -r '.ticked' <<<"$item")" == false ]] || continue
    apply_tick "$(jq -r '.apply.commentId' <<<"$entry")" "$(jq -r '.spec' <<<"$item")" "$(jq -r '.outcome' <<<"$item")" \
      "$(jq -r '.status == "applied"' <<<"$item")" &&
      entry="$(jq -c --argjson i "$i" '.apply.items[$i].ticked = true' <<<"$entry")"
  done
  for (( i = 0; i < n; i++ )); do
    [[ "$(jq -r '.apply.done' <<<"$entry")" == true ]] && break
    st="$(jq -r --argjson i "$i" '.apply.items[$i].status' <<<"$entry")"
    [[ "$st" == pending ]] || continue
    item="$(jq -c --argjson i "$i" '.apply.items[$i]' <<<"$entry")"
    spec="$(jq -r '.spec' <<<"$item")"
    res="$(apply_item "$entry" "$item")"
    [[ "$res" == wait || -z "$res" ]] && break
    if [[ "$res" == applied\ * ]]; then st=applied outcome="${res#applied }"
    else st=refused outcome="refused: ${res#refused }"; fi
    note "apply: $id $spec: $outcome"
    entry="$(jq -c --argjson i "$i" --arg st "$st" --arg o "$outcome" '
      .apply.items[$i].status = $st | .apply.items[$i].outcome = $o
      | if $st == "refused" then .apply.done = true else . end' <<<"$entry")"
    # Saved before the next item runs, so a tick that dies part way never repeats this one; when
    # it can't be saved, nothing more runs
    apply_save "$id" "$entry" || {
      note "warn: apply: $id: watch.json not saved after $spec"; record warn "$id" "apply: watch.json not saved"
      print -r -- "$entry"; return 1
    }
    ticked=true
    apply_tick "$(jq -r '.apply.commentId' <<<"$entry")" "$spec" "$outcome" "$([[ $st == applied ]] && print true || print false)" ||
      { ticked=false; note "warn: apply: $id: the comment was not updated for $spec"; record warn "$id" "apply: comment not updated"; }
    entry="$(jq -c --argjson i "$i" --argjson t "$ticked" '.apply.items[$i].ticked = $t' <<<"$entry")"
  done
  [[ "$(jq '[.apply.items[] | select(.status == "pending")] | length' <<<"$entry")" == 0 ]] &&
    entry="$(jq -c '.apply.done = true' <<<"$entry")"
  # Once only: a done list comes back while a tick is left to retry
  if [[ "$(jq -r '.apply.done == true and .apply.told != true' <<<"$entry")" == true ]]; then
    summary="$(watch -r --arg id "$id" 'include "watch"; .apply | apply_summary($id) | "\(.level)\t\(.message)"' <<<"$entry")" &&
      { note "watch: ${summary/$'\t'/ }"; notice "${summary%%$'\t'*}" "${summary#*$'\t'}"; }
    entry="$(jq -c '.apply.told = true' <<<"$entry")"
  fi
  print -r -- "$entry"
}

# apply_save <id> <entry json>: the ticket's entry written back to watch.json
apply_save() {
  local file="$HOME_DIR/watch.json"
  jq -e '.apply' >/dev/null 2>&1 <<<"$2" || return 0
  jq -c --arg id "$1" --argjson e "$2" '.[$id] = $e' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
}

# Every unfinished list in watch.json, or one with a tick left to retry, each written back as soon
# as it moved. Nothing while paused.
apply_lists() {
  setopt local_options no_err_exit
  local file="$HOME_DIR/watch.json" id entry
  [[ -e "$HOME_DIR/paused" || ! -r "$file" ]] && return 0
  for id in ${(f)"$(jq -r 'to_entries[] | select(.value.apply != null and (.value.apply.done != true or any(.value.apply.items[]; .ticked == false))) | .key' "$file" 2>/dev/null)"}; do
    [[ "$id" == COD-<-> ]] || continue
    entry="$(apply_list "$id" "$(jq -c --arg id "$id" '.[$id]' "$file")")"
    apply_save "$id" "$entry"
  done
  return 0
}

# Parent close: a parent whose agent split finished is closed by the scheduler, since no session
# may come by (an implement-only run stops before the skill's clean-up). Read from the sub-issues
# closed in the last 14 days under a parent still open, each with its parent and the parent's
# sub-issues; watch.jq `parents_to_close` decides. Linear's own parent auto-close stays off.
read -r -d '' PARENTS <<'GQL' || true
query {
  issues(first: 50, orderBy: updatedAt, filter: {
    team: { key: { eq: "COD" } }
    parent: { null: false, state: { type: { nin: ["completed", "canceled"] } } }
    state: { type: { in: ["completed", "canceled"] } }
    updatedAt: { gt: "-P14D" }
  }) {
    nodes {
      parent {
        id identifier
        state { type }
        team { key }
        labels(first: 10) { nodes { name } }
        children(first: 25) {
          nodes { identifier state { type } labels(first: 10) { nodes { name } } }
          pageInfo { hasNextPage }
        }
      }
    }
  }
  teams(filter: { key: { eq: "COD" } }) { nodes { states { nodes { id name type position } } } }
}
GQL
read -r -d '' CLOSE_PARENT <<'GQL' || true
mutation($id: String!, $state: String!) {
  issueUpdate(id: $id, input: { stateId: $state }) { success }
}
GQL
read -r -d '' CLOSE_COMMENT <<'GQL' || true
mutation($id: String!, $body: String!) {
  commentCreate(input: { issueId: $id, body: $body }) { success }
}
GQL

# close_parents: sets each finished parent Done, then posts its **Agent: closed** comment. A
# failed close is a warn and is tried again on the next run; the comment follows only a close
# Linear took, so it is never posted twice, and a failed one only warns. closed-parents keeps
# every parent closed here, one per line, so one Håkan reopens stays open. The page holds only
# sub-issues of open parents, read newest first, so a full one leaves out the oldest closes.
close_parents() {
  setopt local_options no_err_exit
  local file="$HOME_DIR/closed-parents" resp todo state p id vars closed
  resp="$(linear "$PARENTS")" || { print -r -- "Linear did not answer"; return 1; }
  jq -e '.data.issues.nodes' >/dev/null <<<"$resp" 2>/dev/null ||
    { print -r -- "Linear error $(jq -c '.errors[0].message' <<<"$resp" 2>/dev/null)"; return 1; }
  [[ "$(jq '.data.issues.nodes | length' <<<"$resp")" -lt 50 ]] ||
    { note "warn: close: 50 closed sub-issues of open parents, the page limit; older ones are not read"; record warn "" "close: page limit reached"; }
  closed='[]'
  [[ -r "$file" ]] && closed="$(jq -Rsc 'split("\n") | map(select(length > 0))' "$file")"
  todo="$(watch -c --argjson closed "$closed" 'include "watch"; parents_to_close($closed)' <<<"$resp")" ||
    { print -r -- "watch.jq failed$(watch_err)"; return 1; }
  [[ "$(jq '.parents | length' <<<"$todo")" == 0 ]] && return 0
  state="$(jq -r '.state // empty' <<<"$todo")"
  [[ -n "$state" ]] || { print -r -- "no completed state in team COD"; return 1; }
  for p in ${(f)"$(jq -c '.parents[]' <<<"$todo")"}; do
    id="$(jq -r '.identifier' <<<"$p")"
    vars="$(jq -c --arg s "$state" '{id, state: $s}' <<<"$p")"
    resp="$(linear "$CLOSE_PARENT" "$vars")"
    if ! jq -e '.data.issueUpdate.success == true' >/dev/null 2>&1 <<<"$resp"; then
      note "warn: close: $id failed ($(jq -c '.errors[0].message // "no answer"' <<<"$resp" 2>/dev/null))"
      record warn "$id" "close: parent close failed"
      continue
    fi
    print -r -- "$id" >> "$file"
    vars="$(jq -c '{id, body: .comment}' <<<"$p")"
    resp="$(linear "$CLOSE_COMMENT" "$vars")"
    if ! jq -e '.data.commentCreate.success == true' >/dev/null 2>&1 <<<"$resp"; then
      note "warn: close: $id closed, its comment failed ($(jq -c '.errors[0].message // "no answer"' <<<"$resp" 2>/dev/null))"
      record warn "$id" "close: closed without its comment"
    fi
    note "close: $id closed, all sub-issues are closed"
    record closed "$id" "all sub-issues are closed"
    notice info "$id: closed, all sub-issues are closed"
  done
  return 0
}

# Part labels: a split's next part, a sub-issue whose blockers are all closed, gets agent:ready
# from the scheduler unless its report asks Håkan first; watch.jq `parts_to_label_list` decides.
read -r -d '' PARTS <<'GQL' || true
query {
  issues(first: 100, filter: {
    team: { key: { eq: "COD" } }
    parent: { null: false }
    state: { type: { nin: ["completed", "canceled"] } }
  }) {
    nodes {
      id identifier description
      team { key }
      comments(first: 50, orderBy: createdAt) { nodes { body createdAt user { id app } } }
      parent { identifier state { type } }
      state { type }
      labels(first: 20) { nodes { name } }
      inverseRelations(first: 20) {
        nodes { type issue { identifier completedAt state { type } labels(first: 20) { nodes { name } } } }
        pageInfo { hasNextPage }
      }
    }
  }
  issueLabels(filter: { name: { eq: "agent:ready" } }) { nodes { id team { key } } }
}
GQL
read -r -d '' LABEL_PART <<'GQL' || true
mutation($id: String!, $label: String!) {
  issueUpdate(id: $id, input: { addedLabelIds: [$label] }) { success }
}
GQL

# label_parts: adds agent:ready to each part, then posts its **Agent: labelled ready** comment. A
# failed label is a warn and is tried again on the next run; the comment follows only a label
# Linear took. A part labelled here that still lacks its comment gets it first, on every run until
# it lands: ready_by_app takes the queue's label only with that comment. labelled-parts keeps every
# part labelled here, one per line, so one Håkan unlabels is not labelled again.
label_parts() {
  setopt local_options no_err_exit
  local file="$HOME_DIR/labelled-parts" resp ans todo retry label p id vars labelled
  resp="$(linear "$PARTS")" || { print -r -- "Linear did not answer"; return 1; }
  jq -e '.data.issues.nodes' >/dev/null <<<"$resp" 2>/dev/null ||
    { print -r -- "Linear error $(jq -c '.errors[0].message' <<<"$resp" 2>/dev/null)"; return 1; }
  [[ "$(jq '.data.issues.nodes | length' <<<"$resp")" -lt 100 ]] ||
    { note "warn: label: 100 open sub-issues, the page limit; later ones are not read"; record warn "" "label: page limit reached"; }
  labelled='[]'
  [[ -r "$file" ]] && labelled="$(jq -Rsc 'split("\n") | map(select(length > 0))' "$file")"
  todo="$(watch -c --argjson labelled "$labelled" 'include "watch"; parts_to_label_list($labelled)' <<<"$resp")" ||
    { print -r -- "watch.jq failed$(watch_err)"; return 1; }
  retry="$(watch -c --argjson labelled "$labelled" 'include "watch"; parts_to_comment_list($labelled)' <<<"$resp")" ||
    { print -r -- "watch.jq failed$(watch_err)"; return 1; }
  for p in ${(f)"$(jq -c '.[]' <<<"$retry")"}; do
    id="$(jq -r '.identifier' <<<"$p")"
    vars="$(jq -c '{id, body: .comment}' <<<"$p")"
    ans="$(linear "$CLOSE_COMMENT" "$vars")"
    if jq -e '.data.commentCreate.success == true' >/dev/null 2>&1 <<<"$ans"; then
      note "label: $id comment posted on retry"
    else
      note "warn: label: $id comment failed again ($(jq -c '.errors[0].message // "no answer"' <<<"$ans" 2>/dev/null))"
      record warn "$id" "label: labelled without its comment"
    fi
  done
  [[ "$(jq 'length' <<<"$todo")" == 0 ]] && return 0
  label="$(jq -r '[.data.issueLabels.nodes[] | select((.team.key // "COD") == "COD")][0].id // empty' <<<"$resp")"
  [[ -n "$label" ]] || { print -r -- "no agent:ready label in team COD"; return 1; }
  for p in ${(f)"$(jq -c '.[]' <<<"$todo")"}; do
    id="$(jq -r '.identifier' <<<"$p")"
    vars="$(jq -c --arg l "$label" '{id, label: $l}' <<<"$p")"
    resp="$(linear "$LABEL_PART" "$vars")"
    if ! jq -e '.data.issueUpdate.success == true' >/dev/null 2>&1 <<<"$resp"; then
      note "warn: label: $id failed ($(jq -c '.errors[0].message // "no answer"' <<<"$resp" 2>/dev/null))"
      record warn "$id" "label: part label failed"
      continue
    fi
    print -r -- "$id" >> "$file"
    vars="$(jq -c '{id, body: .comment}' <<<"$p")"
    resp="$(linear "$CLOSE_COMMENT" "$vars")"
    if ! jq -e '.data.commentCreate.success == true' >/dev/null 2>&1 <<<"$resp"; then
      note "warn: label: $id labelled, its comment failed ($(jq -c '.errors[0].message // "no answer"' <<<"$resp" 2>/dev/null))"
      record warn "$id" "label: labelled without its comment"
    fi
    note "label: $id labelled agent:ready, every blocker is closed"
    record labelled "$id" "every blocker is closed"
    notice info "$id labelled agent:ready: every blocker is closed"
  done
  return 0
}

# The renovate-labelled tickets with their attachments: a PR one carries is tended, never offered
# again, so closed tickets count too
read -r -d '' RENOVATE_TICKETS <<'GQL' || true
query {
  issues(first: 100, orderBy: updatedAt, includeArchived: true, filter: {
    team: { key: { eq: "COD" } }
    labels: { some: { name: { eq: "renovate" } } }
  }) {
    nodes { identifier attachments { nodes { url } } }
  }
}
GQL

# gh_err <file>: gh_read's stderr as the first line of each attempt, each cut to 120 characters:
# "<line>", plus "; as user: <line>" after its fallback; "(no stderr)" for an attempt that said nothing
gh_err() {
  setopt local_options no_err_exit extended_glob
  local line app="" user="" fell=false
  while IFS= read -r line; do
    line="${${line##[[:space:]]#}%%[[:space:]]#}"
    [[ -z "$line" ]] && continue
    if [[ "$line" == "$GH_READ_FALLBACK" ]]; then fell=true
    elif $fell; then [[ -n "$user" ]] || user="${line[1,120]}"
    else [[ -n "$app" ]] || app="${line[1,120]}"
    fi
  done < "$1"
  print -rn -- "${app:-(no stderr)}"
  $fell && print -rn -- "; as user: ${user:-(no stderr)}"
  return 0
}

# watch_renovate: Renovate's open PRs against the renovate tickets, through watch.jq
# `renovate_step`, into renovate.json in the queue home; one info notice when a PR turns broken. It
# never touches watch.json, whose entries are tickets. A failure leaves the file as it was and says
# why: gh's own error (gh_err), or the start of an answer that is no list, on one line.
watch_renovate() {
  setopt local_options no_err_exit
  local file="$HOME_DIR/renovate.json" errf="$LOGS/renovate.$$.err" prs resp prev out level msg
  # gh asks for 100 commits × 100 authors per PR, and GitHub refuses a query over 500k nodes
  local renovate_limit=30
  gh_identity_or_note
  prs="$(gh_read gh pr list --repo codeware-sthlm/cdwr --author app/renovate --state open --limit "$renovate_limit" \
    --json number,title,url,headRefOid,mergeable,statusCheckRollup,commits 2> "$errf")" ||
    { print -r -- "GitHub: $(gh_err "$errf")"; return 1; }
  # jq reads an empty answer as no input and passes it
  [[ -n "$prs" ]] && jq -e 'type == "array"' >/dev/null 2>&1 <<<"$prs" ||
    { prs="${prs//[[:cntrl:]]/ }"; print -r -- "not a list: ${${prs[1,80]}:-(empty)}"; return 1; }
  [[ "$(jq 'length' <<<"$prs")" -lt "$renovate_limit" ]] ||
    { note "warn: renovate: $renovate_limit open Renovate PRs, the page limit; older ones are not read"; record warn "" "renovate: PR page limit reached"; }
  resp="$(linear "$RENOVATE_TICKETS")" || { print -r -- "Linear did not answer"; return 1; }
  jq -e '.data.issues.nodes' >/dev/null <<<"$resp" 2>/dev/null ||
    { print -r -- "Linear error $(jq -c '.errors[0].message' <<<"$resp" 2>/dev/null)"; return 1; }
  [[ "$(jq '.data.issues.nodes | length' <<<"$resp")" -lt 100 ]] ||
    { note "warn: renovate: 100 renovate tickets, the page limit; older ones are not read"; record warn "" "renovate: page limit reached"; }
  # null without a file: the first run sends no notices for PRs already broken
  prev="$(jq -c 'if type == "object" then . else {} end' "$file" 2>/dev/null)"
  [[ -n "$prev" ]] || prev=null
  # The PR list on stdin: with its commits it can outgrow an argument
  out="$(watch -c --argjson tickets "$(jq -c '.data.issues.nodes' <<<"$resp")" \
    --argjson prev "$prev" --arg at "$(date -u +%FT%TZ)" \
    'include "watch"; {prs: ., tickets: $tickets, prev: $prev, at: $at} | renovate_step' <<<"$prs")" ||
    { print -r -- "watch.jq failed$(watch_err)"; return 1; }
  # The state first: a failed write sends nothing, so the next run doesn't repeat the notices
  { jq -c '.state' <<<"$out" > "$file.tmp" && mv "$file.tmp" "$file"; } ||
    { print -r -- "could not write renovate.json"; return 1; }
  while IFS=$'\t' read -r level msg; do
    [[ -z "$level" ]] && continue
    note "renovate: $level $msg"
    notice "$level" "$msg"
  done <<<"$(jq -r '.notices[] | "\(.level)\t\(.message)"' <<<"$out")"
  return 0
}

# One fetch per run: the job line and planning both read origin/main. A failure never stops the run.
# The platform move may have fetched already.
if ! $check && ! $fetched; then
  git -C "$REPO" fetch -q origin 2>/dev/null || note "warn: fetch failed"
fi

# Watching sends notices, so --check leaves it out; a failure never stops planning.
if ! $check; then
  err="$(watch_prs)" || { note "warn: watch failed (${err:-unknown})"; record warn "" "watch failed: ${err:-unknown}"; }
  # After the watch, which stores each list at its merge
  apply_lists
  err="$(watch_renovate)" || { note "warn: renovate watch failed (${err:-unknown})"; record warn "" "renovate watch failed: ${err:-unknown}"; }
  # Same rule: a failure is a warn, never a stop
  err="$(close_parents)" || { note "warn: parent close failed (${err:-unknown})"; record warn "" "parent close failed: ${err:-unknown}"; }
  err="$(label_parts)" || { note "warn: part label failed (${err:-unknown})"; record warn "" "part label failed: ${err:-unknown}"; }
fi

# What an attended /work-queue session would do now, from watch.jq's `attended` (the computed
# form of the skill's "What to take next"). It reads watch.json, so it runs after the watch;
# --check uses the last run's watch.json. On a Mac without the scheduler that file is never
# refreshed, so the state comes from the NUC's queue_state row instead (watch_state in lib.sh).
# A failure leaves the line empty, never stops the run.
attended_line=""
queue_view=""
attended_watch=""
# audit_notices <view>: one action notice per gap of the view's audit that has stood for 15 minutes
# without being told, so a state that settles by itself (a merge before its label moves, a label
# before its comment) stays quiet. audit-seen.json maps a gap id to { first, told }; an id that left
# the audit leaves the file, so a gap that closes and returns starts over. Up to 3 due gaps get a
# notice each, more get one summary. A view without an audit (the jq call failed) leaves the file alone.
audit_notices() {
  setopt local_options no_err_exit
  local file="$HOME_DIR/audit-seen.json" seen out n
  jq -e '.audit | type == "array"' >/dev/null 2>&1 <<<"$1" || return 0
  seen="$(jq -ce 'objects' "$file" 2>/dev/null || print '{}')"
  [[ -n "$seen" ]] || seen='{}'
  out="$(jq -c --argjson seen "$seen" --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson at "$(date +%s)" '
    def ts: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
    ([ .audit[] | select(.candidate != true) | .id as $i | ($seen[$i] // null) as $p
       | { key: $i, value: (if $p == null then { first: $now, told: false }
                            elif ($p | type) == "string" then { first: $p, told: true }
                            else $p end) } ] | from_entries) as $st
    | [ .audit[] | select(.candidate != true) | select($st[.id].told | not) | select(($st[.id].first | ts) <= $at - 900) ] as $due
    | { state: ($st | with_entries(if (.key as $k | $due | any(.id == $k)) then .value.told = true else . end)),
        due: $due }' <<<"$1")" || return 0
  # Recorded before the notices go out, so a crash in between tells nobody twice
  jq -c '.state' <<<"$out" > "$file.tmp" && mv "$file.tmp" "$file" || return 0
  n="$(jq '.due | length' <<<"$out")"
  if (( n > 3 )); then
    notice action "Agent queue: $n new gaps, e.g. $(jq -r '.due[0].what' <<<"$out"). See cdwr agent status or the desk."
  elif (( n > 0 )); then
    local line
    jq -r '.due[] | "Gap: \(.what). \(.fix)"' <<<"$out" | while IFS= read -r line; do notice action "$line"; done
  fi
}

# tree_wide: the TREE_QUERY result as { nodes, truncated }, read again only when tree-nodes.json is
# older than AGENT_QUEUE_TREE_TTL_MIN minutes (15; 0 reads every run). A failed read falls back on
# the file however old it is; no file either fails.
tree_wide() {
  setopt local_options no_err_exit
  local f="$HOME_DIR/tree-nodes.json" ttl="${AGENT_QUEUE_TREE_TTL_MIN:-15}" out
  [[ "$ttl" == <-> ]] || ttl=15
  if (( ttl > 0 )) && [[ -s "$f" && -n "$(find "$f" -mmin "-$ttl" 2>/dev/null)" ]] &&
     jq -e '.nodes | type == "array"' "$f" >/dev/null 2>&1; then
    cat "$f"; return 0
  fi
  if out="$(tree_nodes)" && jq -e '.nodes | type == "array"' >/dev/null 2>&1 <<<"$out"; then
    print -r -- "$out" > "$f.tmp" && mv "$f.tmp" "$f"
    print -r -- "$out"; return 0
  fi
  if [[ -s "$f" ]] && jq -e '.nodes | type == "array"' "$f" >/dev/null 2>&1; then cat "$f"; return 0; fi
  return 1
}

attended() {
  setopt local_options no_err_exit
  local resp state verdict waits renovate launch_state=null
  # Before the Linear read, so --check reports the source even when Linear fails
  watch_state "$HOME_DIR/watch.json"
  state="$WATCH_STATE"
  renovate="$RENOVATE_STATE"
  attended_watch="$state"
  if $check; then
    # Where the watch state came from, and the state itself, for `status`
    print -r -- "watch-source: $WATCH_SOURCE"
    print -r -- "watch-state: $state"
  fi
  resp="$(linear "$ATTENDED_QUERY" | attended_nodes)"
  if ! jq -e '.data.issues.nodes' >/dev/null <<<"$resp" 2>/dev/null; then
    note "warn: attended: Linear error $(jq -c '.errors[0].message' <<<"$resp" 2>/dev/null)"; return 0
  fi
  # The fallback was already noted by watch_prs, so this one stays quiet
  waits="$(gh_identity || true; parked_waits <<<"$resp")"
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
      # ps, not kill -0: a session runs as another user in the container, whose processes this
      # one may see but not signal
      if ! $remote; then
        [[ -n "$pid" ]] && ps -p "$pid" >/dev/null 2>&1 && pa=true
        [[ "$wpid" == <-> ]] && ps -p "$wpid" >/dev/null 2>&1 && wa=true
      fi
      # Ended or dead for over 24 h: delete
      if [[ "$pa" == false || "$(jq -r '.state' "$f" 2>/dev/null)" == ended ]] &&
         (( $(date +%s) - $(jq -r '.lastSeen // empty | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601' "$f" 2>/dev/null || echo 0) > 86400 )); then
        rm -f "$f" "${f%.json}.watcher" "${f%.json}.seen" "$f.mirrored" "$f.beat" "$f.beatpending" "$f.relayed"; continue
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
      [[ "$wpid" == <-> ]] && ps -p "$wpid" >/dev/null 2>&1 || rm -f "$w"
    done
    # What wait.sh last reported to a session that no longer exists
    for w in "$SESSIONS"/*.seen(N); do
      [[ -f "${w%.seen}.json" ]] || rm -f "$w"
    done
    (( ${#items[@]} )) && sessions_json="$(printf '%s\n' "${items[@]}" | jq -cs '.' 2>/dev/null || echo '[]')"
  fi
  session="$(watch -c --argjson now "$(date +%s)" 'include "watch"; session_state($now)' <<<"$sessions_json" 2>/dev/null)" ||
    session='{"state":"none","detail":null,"id":null,"ticket":null,"lastSeen":null}'
  verdict="$(watch -c --argjson now "$(date +%s)" --argjson limit "$(queue_limit "$HOME_DIR")" --argjson watch "$state" --argjson waits "$waits" \
    --argjson renovate "$renovate" --argjson session "$session" \
    'include "watch"; .data.issues.nodes | attended($now; $limit; $watch; $waits; $renovate; $session)' <<<"$resp")" ||
    { note "warn: attended: watch.jq failed$(watch_err)"; return 0; }
  attended_line="$(watch -r 'include "watch"; attended_line' <<<"$verdict")"
  [[ "$(jq -r '.verdict' <<<"$verdict" 2>/dev/null)" == idle ]] && attended_work=false || attended_work=true
  attended_line="$(watch -r 'include "watch"; session_prefix' <<<"$session") · $attended_line"
  # The whole queue for queue_state and `cdwr agent status`; the pick above stays the
  # line and the notice
  queue_view="$(watch -c --argjson now "$(date +%s)" --argjson limit "$(queue_limit "$HOME_DIR")" --argjson watch "$state" --argjson session "$session" --argjson waits "$waits" \
    --argjson renovate "$renovate" \
    'include "watch"; .data.issues.nodes | queue_view($now; $limit; $watch; $session; $waits; $renovate)' <<<"$resp")" ||
    { note "warn: queue view: watch.jq failed$(watch_err)"; queue_view=""; }
  # The audit and the tree join the view; a failure keeps the view as it was. The audit's launch
  # guard reads launch.json before this run changes it. The output goes through files: it is too
  # large for an argument.
  [[ -f "$HOME_DIR/launch.json" ]] && launch_state="$(jq -ce 'objects' "$HOME_DIR/launch.json" 2>/dev/null || print null)"
  if [[ -n "$queue_view" ]]; then
    local ax="$HOME_DIR/audit-view.tmp.$$" wide order
    # The wider ticket read, kept for a while; without it the audit and the tree keep to the agent
    # tickets. The nodes go through a file: they outgrow an argument.
    echo '[]' > "$ax.wide"
    if wide="$(tree_wide)"; then
      jq -c '.nodes' <<<"$wide" > "$ax.wide"
      [[ "$(jq -r '.truncated' <<<"$wide")" == true ]] && note "warn: tree: more than 200 open tickets, the rest left out"
    else
      note "warn: tree: Linear read failed, the tree keeps to the agent tickets"
    fi
    order="$(jq -c '[ (.next[].ticket), (.held.tickets[]) ] | reduce .[] as $t ([]; if index([$t]) then . else . + [$t] end)' <<<"$queue_view")"
    if watch -c --argjson now "$(date +%s)" --argjson watch "$state" --argjson launch "$launch_state" \
         --argjson runnable "$(jq -c '.runnable // []' <<<"$verdict")" --slurpfile wide "$ax.wide" \
         'include "watch"; .data.issues.nodes | audit($now; $watch; $launch; $runnable; $wide[0])' <<<"$resp" > "$ax.audit" &&
       watch -c --argjson now "$(date +%s)" --argjson watch "$state" --slurpfile gaps "$ax.audit" \
         --argjson order "$order" --slurpfile wide "$ax.wide" \
         'include "watch"; .data.issues.nodes | tree($now; $watch; $gaps[0]; $order; $wide[0])' <<<"$resp" > "$ax.tree" &&
       jq -c --slurpfile a "$ax.audit" --slurpfile t "$ax.tree" '. + { audit: $a[0], tree: $t[0] }' <<<"$queue_view" > "$ax.view"; then
      queue_view="$(<"$ax.view")"
    else
      # Keep the last good gaps and tree rather than persist a view without them
      local carried=""
      if [[ -f "$HOME_DIR/queue-view.json" ]] &&
         jq -ce --slurpfile p "$HOME_DIR/queue-view.json" \
           '. + ($p[0] | { audit, tree } | with_entries(select(.value != null)))' <<<"$queue_view" > "$ax.view" 2>/dev/null; then
        queue_view="$(<"$ax.view")"
        carried=" (kept the previous audit and tree)"
      fi
      note "warn: audit: watch.jq failed$carried$(watch_err)"
    fi
    rm -f "$ax.audit" "$ax.tree" "$ax.view" "$ax.wide"
  fi
  # Should an implement-only session start? watch.jq `launch` decides from the pick and the
  # guards; implement.sh holds implement.lock while its session runs and writes the spend ledger.
  # The lock holds its owner's pid; it is cleared only when that process is gone (a kill skips the
  # EXIT trap). A lock without a pid older than a minute lost its owner between mkdir and write.
  local lockdir="$HOME_DIR/implement.lock" locked=false spent cap last decision owner
  if [[ -d "$lockdir" ]] && ! implement_live; then
    owner="$(cat "$lockdir/pid" 2>/dev/null)"
    rm -rf "$lockdir" && note "warn: cleared implement.lock; its session ${owner:-?} is gone"
  fi
  [[ -d "$lockdir" ]] && locked=true
  spent="$(spent_today)"
  [[ "$spent" == null ]] && note "warn: implement-spend.jsonl unreadable; no launch today"
  cap="$(implement_cap)"
  last="$launch_state"
  local guards limited_until
  # When the plan's session limit lifts (`07:10 UTC`), or empty with no hold in force
  limited_until="$(limit_held || true)"
  guards="$(jq -nc --argjson session "$session" --argjson locked "$locked" --argjson spent "$spent" \
    --argjson cap "$cap" --argjson last "$last" --arg limited "$limited_until" \
    '{session: $session, locked: $locked, spent: $spent, cap: $cap, last: $last,
      limitedUntil: (if $limited == "" then null else $limited end)}')"
  decision="$(watch -c --argjson g "$guards" 'include "watch"; launch($g)' <<<"$verdict" 2>/dev/null)" ||
    { local why="watch.jq failed$(watch_err)"; note "warn: launch: $why"
      decision="$(jq -c --arg r "$why" '{action: "skip", reason: $r, key: null, pick: (if .verdict == "run" and .reason != "ready" then {ticket, reason, detail} else null end)}' <<<"$verdict")"; }
  # Implement sessions run in the container only (COD-657): elsewhere a launch is a notice, so the
  # Mac sends it and never counts a miss for work it may not run
  if [[ "${AGENT_QUEUE_HOST:-}" != container && "$(jq -r '.action' <<<"$decision")" == launch ]]; then
    decision="$(jq -c '.action = "notify" | .reason = "implement runs only in the container"' <<<"$decision")"
  fi
  if $check; then
    print -r -- "attended: $attended_line"
    print -r -- "launch: $(jq -r '.action + (if .reason then " (" + .reason + ")" else "" end)' <<<"$decision")"
    [[ -n "$queue_view" ]] && print -r -- "queue-view: $queue_view"
    return 0
  fi
  [[ -n "$queue_view" ]] && audit_notices "$queue_view"
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
    notice info "Agent queue: started an implementing session, $(watch -r 'include "watch"; .pick + {verdict: "run"} | attended_line | ltrimstr("run now: ")' <<<"$decision")."
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
  key="$(jq -c --argjson s "$session" --argjson d "$decision" --arg a "$action" \
    '{verdict, ticket, reason, pick: ($d.pick | if . == null then null else "\(.ticket) \(.reason)" end), session: $s.state, launch: $a}' <<<"$verdict")"
  prev="$(cat "$file" 2>/dev/null)"
  if [[ "$key" != "$prev" ]]; then
    print -r -- "$key" > "$file"
    sstate="$(jq -r '.state' <<<"$session")"
    if [[ -n "$(jq -r '.pick.ticket // empty' <<<"$decision")" &&
          ( "$sstate" == none || "$sstate" == stopped ) && ! $locked ]]; then
      note "attended: $attended_line"
      notice action "Agent queue: no session running, $(watch -r 'include "watch"; .pick + {verdict: "run"} | attended_line | ltrimstr("run now: ")' <<<"$decision").$why Start /work-queue."
    fi
  fi
}
# status reads this line: whether a claude run here would have Linear tools
if $check; then
  why="$(linear_tools)"
  via=
  [[ "$LINEAR_MCP" == key && -n "$LINEAR_PROXY_URL" ]] && via=" via proxy"
  if [[ -n "$why" ]]; then print -r -- "linear: missing ($why)"; else print -r -- "linear: ok ($LINEAR_MCP$via)"; fi
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
      description
      state { type }
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

# Plan-only: an agent:ready ticket for this repo, not blocked by an open ticket, with no plan yet.
ready="$(watch -r --argjson other "$OTHER_REPOS" 'include "watch";
  .data.issues.nodes[]
  | select((status_rows | length) == 0)
  | select((.labels.nodes | map(.name | IN($other[])) | any) | not)
  | select([.inverseRelations.nodes[] | select(.type == "blocks" and (.issue.state.type | IN("completed","canceled") | not))] | length == 0)
  | .identifier' <<<"$resp")" ||
  { why="$(watch_err)"; note "warn: watch: watch.jq failed on the ready selection$why"; record warn "" "watch: watch.jq failed on the ready selection$why"; exit 0; }

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

# stamp_age <file>: whole days since the date a stamp file holds; empty when there is no stamp
stamp_age() {
  local ran
  ran="$(cat "$1" 2>/dev/null)"
  [[ "$ran" == <->-<->-<-> ]] || return 0
  print $(( ( $(date +%s) - $(date -j -f %F "$ran" +%s 2>/dev/null || date -d "$ran" +%s 2>/dev/null || echo 0) ) / 86400 ))
}

# suggest_gate: prints due (focus <dx|maintenance|looks>), done today, not before HH:00,
# skipped, COD-n is open, unavailable (Linear did not answer, so nothing runs), or off.
suggest_gate() {
  setopt local_options no_err_exit
  local age open hour ideas
  local -a focuses=(dx maintenance looks)
  if [[ "$SUGGEST_DAYS" != <-> || "$SUGGEST_DAYS" == 0 ]]; then print off; return 0; fi
  age="$(stamp_age "$HOME_DIR/suggest-ran-on")"
  if [[ -n "$age" ]] && (( age < SUGGEST_DAYS )); then print "done today"; return 0; fi
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

# devlog_gate: prints due, done (next in N day(s)), not before HH:00, or off. It starts after
# SUGGEST_HOUR like the suggestion, on an idle tick the suggestion leaves.
devlog_gate() {
  setopt local_options no_err_exit
  local age hour
  if [[ "$DEVLOG_DAYS" != <-> || "$DEVLOG_DAYS" == 0 ]]; then print off; return 0; fi
  age="$(stamp_age "$HOME_DIR/devlog-ran-on")"
  if [[ -n "$age" ]] && (( age < DEVLOG_DAYS )); then print "done, next in $(( DEVLOG_DAYS - age )) day(s)"; return 0; fi
  hour=$(( 10#$(date +%H) ))
  if (( hour < SUGGEST_HOUR )); then printf 'not before %02d:00\n' "$SUGGEST_HOUR"; return 0; fi
  print due
}

# review_gate: prints requested (a desk click, which beats the schedule and the hour), due, ran today,
# done (next in N day(s)), not before HH:00, or off. It starts after SUGGEST_HOUR like the suggestion,
# on an idle tick the suggestion leaves.
review_gate() {
  setopt local_options no_err_exit
  local age hour
  if [[ -e "$HOME_DIR/review-requested" ]]; then print requested; return 0; fi
  if [[ "$REVIEW_DAYS" != <-> || "$REVIEW_DAYS" == 0 ]]; then print off; return 0; fi
  age="$(stamp_age "$HOME_DIR/review-ran-on")"
  if [[ -n "$age" ]] && (( age < REVIEW_DAYS )); then
    if (( age == 0 )); then print "ran today"; else print "done, next in $(( REVIEW_DAYS - age )) day(s)"; fi
    return 0
  fi
  hour=$(( 10#$(date +%H) ))
  if (( hour < SUGGEST_HOUR )); then printf 'not before %02d:00\n' "$SUGGEST_HOUR"; return 0; fi
  print due
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
  # The plan's session limit holds every claude run until the reset (lib.sh); nothing failed here
  if limit_hold "$result"; then
    outcome=limited
    note "limited: ${tag:+$tag }$LIMIT_TEXT (see $log)"
    $LIMIT_NEW && notice info "Agent queue: session limit reached, launches held until $(limit_held || print 'the reset')"
    record limited "" "${tag:+$tag: }$LIMIT_TEXT, log $log$spent"
  elif [[ "$(jq -r '.subtype // empty' "$result" 2>/dev/null)" == error_max_budget_usd ]]; then
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
    --disallowedTools mcp__linear mcp__sentry mcp__claude_ai_Supabase mcp__claude_ai_Claude_Docs "Bash(*force-push.sh*)" \
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
    # Never ran: the day's stamp goes back, so it runs after the reset
    limited) rm -f "$HOME_DIR/suggest-ran-on"; suggested_line "session limit, runs after the reset"; return 0 ;;
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

# The once-a-week devlog session: reads the merged pull requests and drafts at most two posts in the cms.
# It ends with one or more `DRAFTED <post id> <title>` lines, `nothing this week` or `failed: <line>`.
devlog_run() {
  local log result rc=0 spent="" outcome line id title count=0 verdict verdicts
  run_kind=devlog
  linear_ok || { devlog_line "no Linear tools"; return 0; }
  cd "$REPO"
  to_main devlogging
  log="$LOGS/$(date +%F_%H%M)-devlog.log"
  result="${log%.log}.json"
  note "devlog: → $log"
  # Stamped as soon as it starts, so a crash can't run it twice in a week
  date +%F > "$HOME_DIR/devlog-ran-on"
  mkdir -p "$HOME_DIR/devlog-drafts"

  # Same shape as the suggest call; the draft files go under devlog-drafts, written with `//` roots.
  ( gh_identity_or_note
  "${claude_env[@]}" ENABLE_TOOL_SEARCH=false claude -p "/devlog-draft home=$HOME_DIR" \
    --model opus "${LINEAR_MCP_ARGS[@]}" \
    --settings '{"disabledMcpjsonServers":["linear","sentry"]}' \
    --disallowedTools mcp__linear mcp__sentry mcp__claude_ai_Sentry mcp__claude_ai_Supabase mcp__claude_ai_Claude_Docs "Bash(*force-push.sh*)" \
    --tools "Read,Grep,Glob,Skill,Bash,Write,Edit" \
    --permission-mode dontAsk --permission-prompts none \
    --max-budget-usd "$DEVLOG_BUDGET_USD" --output-format json \
    --allowedTools Skill Read Grep Glob "$L"__get_issue "$L"__list_comments \
      "Bash(gh pr list *)" "Bash(gh pr view *)" "Bash(node tools/cdwr/bin/cdwr.mjs devlog covered*)" "Bash(node tools/cdwr/bin/cdwr.mjs devlog draft *)" \
      "Write(/$HOME_DIR/devlog-drafts/**)" "Edit(/$HOME_DIR/devlog-drafts/**)"
  ) > "$result" 2> "$log" || rc=$?

  run_outcome "a devlog run" devlog "$DEVLOG_BUDGET_USD" "$log" "$result" "$rc"
  # A cap leaves no result to read. A failed exit may still have drafted: its lines are read below.
  # A limited run never ran: the week's stamp goes back, so it runs after the reset
  if [[ "$outcome" == limited ]]; then rm -f "$HOME_DIR/devlog-ran-on"; devlog_line "session limit, runs after the reset"; return 0; fi
  if [[ "$outcome" == cap ]]; then devlog_line "stopped at the budget"; return 0; fi

  # Only verdict lines count, so a code fence or blank lines around them do not matter. Every
  # draft is recorded before a trailing failure: the cms holds the post whether or not the
  # second one broke, and Håkan has to hear about it either way
  verdicts="$(jq -r '.result // empty' "$result" 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' |
    grep -E '^(DRAFTED .+|nothing this week|failed: .+)$' || true)"
  while IFS= read -r line; do
    [[ "$line" == "DRAFTED "* ]] || continue
    verdict="${line#DRAFTED }"
    id="${verdict%% *}"; title="${verdict#* }"
    [[ "$title" == "$verdict" ]] && title=""
    note "devlog: drafted $id $title"
    record drafted "$id" "$title$spent"
    notice action "Devlog draft: ${title:-post $id}. Publish or delete it in the admin."
    (( ++count ))
  done <<<"$verdicts"
  line="$(print -r -- "$verdicts" | tail -n 1)"
  if [[ "$outcome" == failed ]]; then
    if (( count > 0 )); then devlog_line "$count draft(s), then claude failed"; else devlog_line "failed"; fi
  elif [[ "$line" == "failed: "* ]]; then
    note "fail: devlog: $line"
    record failed "" "devlog: ${line#failed: }$spent"
    notice action "Devlog: ${line#failed: }"
    if (( count > 0 )); then devlog_line "$count draft(s), failed: ${line#failed: }"; else devlog_line "failed: ${line#failed: }"; fi
  elif (( count > 0 )); then
    devlog_line "$count draft(s)"
  elif [[ "$line" == "nothing this week" ]]; then
    note "devlog: nothing this week"
    record nothing "" "devlog: nothing this week$spent"
    devlog_line "nothing this week"
  else
    note "warn: devlog: no verdict (see $log)"
    record warn "" "devlog: no verdict, see $log"
    devlog_line "no verdict"
  fi
}

# The daily backlog review: reads the queue view the run just wrote (tree and audit candidates) and
# the last 90 days of dismissals, each with the finding it names, and writes its brief, actions and
# findings to review-out.json.
# It ends with `REVIEWED <n> actions` or `failed: <line>`. `cdwr agent review-check` validates the
# file and prints the reviews row; nothing is stored for a file it refuses.
review_run() {
  local log result rc=0 spent="" outcome line cost row out_json issue n since
  local out="$HOME_DIR/review-out.json" model=opus requested=false
  run_kind=review
  [[ -e "$HOME_DIR/review-requested" ]] && requested=true
  linear_ok || { review_line "no Linear tools"; return 0; }
  cd "$REPO"
  to_main reviewing
  log="$LOGS/$(date +%F_%H%M)-review.log"
  result="${log%.log}.json"
  note "review: → $log"
  # Stamped as soon as it starts, so a crash can't run it twice in a day. review-ran-at is the
  # desk command's one-hour limit. The request is consumed here, a stale result removed.
  date +%F > "$HOME_DIR/review-ran-on"
  date +%s > "$HOME_DIR/review-ran-at"
  rm -f "$HOME_DIR/review-requested" "$out"

  if [[ -n "$queue_view" ]]; then print -r -- "$queue_view" > "$HOME_DIR/review-view.json"
  elif [[ -s "$HOME_DIR/queue-view.json" ]]; then cp "$HOME_DIR/queue-view.json" "$HOME_DIR/review-view.json"
  else
    note "warn: review: no queue view"; record warn "" "review: no queue view"
    review_line "failed: no queue view"; return 0
  fi
  # Dismissals hold for 90 days, as the desk reads them. Each goes to the session with the stored
  # finding it names (ticket, kind, key, fix), found in the reviews of the same window; the rows go
  # through files, never arguments.
  since="$(TZ=UTC date -v-90d +%F 2>/dev/null || TZ=UTC date -d "90 days ago" +%F 2>/dev/null)"
  supabase_select review_dismissals "at=gte.$since&order=at.desc" > "$HOME_DIR/review-dismissals.tmp" ||
    print -r -- '[]' > "$HOME_DIR/review-dismissals.tmp"
  supabase_select reviews "at=gte.$since&select=findings" > "$HOME_DIR/review-findings.tmp" ||
    print -r -- '[]' > "$HOME_DIR/review-findings.tmp"
  jq --slurpfile reviews "$HOME_DIR/review-findings.tmp" '
      ([$reviews[0][]? | .findings[]? | objects] | INDEX(.id)) as $found
      | [.[] | . as $d | ($found[$d.finding_id] // {}) as $f
        | {finding_id: $d.finding_id, at: $d.at, note: $d.note}
          + ($f | {ticket, kind, key, fix} | with_entries(select(.value != null)))]' \
    "$HOME_DIR/review-dismissals.tmp" > "$HOME_DIR/review-dismissed.json" 2>/dev/null ||
    print -r -- '[]' > "$HOME_DIR/review-dismissed.json"
  rm -f "$HOME_DIR/review-dismissals.tmp" "$HOME_DIR/review-findings.tmp"

  # Same shape as the suggest call; it writes only the out file and its taste file in memory.
  ( gh_identity_or_note
  "${claude_env[@]}" ENABLE_TOOL_SEARCH=false claude -p "/review-backlog memory=${MEMORY_DIR:-none} view=$HOME_DIR/review-view.json dismissed=$HOME_DIR/review-dismissed.json out=$out" \
    --model "$model" "${LINEAR_MCP_ARGS[@]}" \
    --settings '{"disabledMcpjsonServers":["linear","sentry"]}' \
    --disallowedTools mcp__linear mcp__sentry mcp__claude_ai_Sentry mcp__claude_ai_Supabase mcp__claude_ai_Claude_Docs \
      "Read(**/.env*)" "Read(//**/.claude.json)" "Read(//**/.cdwr/*.*)" "Read(//run/agent/**)" \
      "Read(/$HOME_DIR/linear.token*)" "Read(/$HOME_DIR/linear-app.env*)" \
      "Bash(*/run/agent/*)" "Bash(*linear.token*)" "Bash(*linear-app.env*)" "Bash(*security find-generic-password*)" "Bash(*AGENT_QUEUE_LINEAR*)" \
      "Bash(*force-push.sh*)" \
    --tools "Read,Grep,Glob,Skill,Bash,Write,Edit" \
    --permission-mode dontAsk --permission-prompts none \
    --max-budget-usd "$REVIEW_BUDGET_USD" --output-format json \
    --allowedTools Skill Read Grep Glob \
      "$L"__list_issues "$L"__get_issue "$L"__list_comments "$L"__list_issue_labels \
      "Bash(git log --since=60.days --oneline)" "Bash(gh pr list *)" "Bash(gh pr view *)" "Bash(tools/cdwr/agent-queue/gh-review.sh threads *)" \
      "Write(/$out)" "Edit(/$out)" \
      ${MEMORY_DIR:+"Write(/$MEMORY_DIR/feedback_review_taste.md)" "Edit(/$MEMORY_DIR/feedback_review_taste.md)"}
  ) > "$result" 2> "$log" || rc=$?

  run_outcome "a review run" review "$REVIEW_BUDGET_USD" "$log" "$result" "$rc"
  case "$outcome" in
    # Never ran: the stamps and a desk request go back, so it runs after the reset
    limited)
      rm -f "$HOME_DIR/review-ran-on" "$HOME_DIR/review-ran-at"
      $requested && : > "$HOME_DIR/review-requested"
      review_line "session limit, runs after the reset"; return 0 ;;
    cap) review_line "stopped at the budget"; return 0 ;;
    failed) review_line "failed"; return 0 ;;
  esac

  line="$(jq -r '.result // empty' "$result" 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' |
    grep -E '^(REVIEWED [0-9]+ actions?|failed: .+)$' | tail -n 1 || true)"
  if [[ "$line" == "REVIEWED "* ]]; then
    n="${${line#REVIEWED }%% *}"
    cost="$(jq -r '.total_cost_usd // empty' "$result" 2>/dev/null || true)"
    [[ "$cost" == <->(|.<->) ]] || cost=0
    # With --json the check prints {"ok":true,"result":<row>}, or {"ok":false,"error":{"message":"failed: …"}}
    out_json="$(node "$REPO/tools/cdwr/bin/cdwr.mjs" agent review-check "$out" --host "$(telemetry_host)" --cost "$cost" --model "$model" --json 2>> "$log" </dev/null || true)"
    if row="$(jq -ce 'select(.ok == true) | .result | objects' <<<"$out_json" 2>/dev/null)"; then
      if ! supabase_insert_checked reviews "$row"; then
        note "warn: review: not stored (see $log)"
        record warn "" "review: not stored"
        review_line "failed: not stored"
        return 0
      fi
      note "review: $n action(s)"
      record nothing "" "review: $n action(s)$spent"
      review_line "ran $(date +%H:%M), $n actions, \$$(printf '%.2f' "$cost")"
      return 0
    fi
    issue="$(jq -r '.error.message // empty' <<<"$out_json" 2>/dev/null || true)"
    issue="${${issue#failed: }:-review-check printed no row}"
    note "warn: review: $issue (see $log)"
    record warn "" "review: $issue"
    review_line "failed: $issue"
  elif [[ "$line" == "failed: "* ]]; then
    note "fail: review: $line"
    record warn "" "review: ${line#failed: }$spent"
    review_line "failed: ${line#failed: }"
  else
    note "warn: review: no verdict (see $log)"
    record warn "" "review: no verdict, see $log"
    review_line "no verdict"
  fi
}

if [[ -z "$ready" ]]; then
  gate="$(suggest_gate)"
  # The decision stays the last line: status reads it from there
  if $check; then
    limit_at="$(limit_held)" && print -r -- "limit: claude runs held until $limit_at"
    print -r -- "suggest: $gate"; print -r -- "review: $(review_gate)"; print -r -- "devlog: $(devlog_gate)"; echo "idle: nothing to plan"; exit 0
  fi
  # The plan's session limit holds every claude run until the reset; a note, not a row, each tick
  if limit_at="$(limit_held)"; then note "skip: session limit, claude runs held until $limit_at"; exit 0; fi
  # A desk click beats the suggestion as well as the schedule
  if [[ -e "$HOME_DIR/review-requested" ]]; then review_run; exit 0; fi
  case "$gate" in
    due*) suggest_run "${${gate#*focus }%)}" ;;
    skipped*)
      date +%F > "$HOME_DIR/suggest-ran-on"
      record skip "" "suggest: ${${gate#skipped, }%% *} still open"
      suggested_line "${gate#skipped, }" ;;
    unavailable*) note "suggest: $gate" ;;
    # The review takes an idle tick the suggestion leaves, the weekly devlog one the review leaves:
    # one claude session per run
    *) review_state="$(review_gate)"
       if [[ "$review_state" == due ]]; then review_run
       elif [[ "$(devlog_gate)" == due ]]; then devlog_run; fi ;;
  esac
  exit 0
fi
if $check; then
  print -r -- "suggest: $(suggest_gate)"
  print -r -- "review: $(review_gate)"
  print -r -- "devlog: $(devlog_gate)"
  limit_at="$(limit_held)" && print -r -- "limit: claude runs held until $limit_at"
  echo "would plan one of: $(print -r -- "$ready" | tr '\n' ' ')"; exit 0
fi

if limit_at="$(limit_held)"; then note "skip: session limit, planning held until $limit_at"; exit 0; fi
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

# A ticket offered as agent:ready was planned by this run when it now waits on needs-input (a plan
# for Håkan to approve), or is still agent:ready with a plan (approved by the run itself): offered
# tickets had no plan.
read -r -d '' PLANNED <<'GQL' || true
query {
  issues(first: 100, filter: {
    team: { key: { eq: "COD" } }
    labels: { some: { name: { in: ["agent:needs-input", "agent:ready"] } } }
  }) { nodes { identifier description labels(first: 20) { nodes { name } } } }
}
GQL
if after="$(linear "$PLANNED")" && ! jq -e '.errors' >/dev/null <<<"$after"; then
  planned=0
  for row in $(jq -r --arg ready "$ready" '
      ($ready | split("\n")) as $offered
      | .data.issues.nodes[] | select(.identifier | IN($offered[]))
      | if any(.labels.nodes[]; .name == "agent:needs-input") then "\(.identifier):ask"
        elif (.description // "") | test("(^|\n)##\\s+plan\\s*(\n|$)"; "i") then "\(.identifier):approved"
        else empty end' <<<"$after" 2>/dev/null); do
    id="${row%%:*}"
    note "planned: $id (${row#*:})"
    record planned "$id" "log $log$spent"
    if [[ "${row#*:}" == ask ]]; then notify "$id: plan ready, needs your approval"
    else notice info "$id: plan approved, an implementing run follows"; fi
    (( ++planned ))
  done
  # A clean exit that planned nothing is a failure all the same, e.g. no Linear tools.
  # Planned tickets are left out of `ready`, so this fires only for a ticket that really needed a plan.
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

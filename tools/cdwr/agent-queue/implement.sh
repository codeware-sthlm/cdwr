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
#   implement.sh <key>   started by run.sh with nohup; <key> is the launch key, which the session
#                        takes first, and the records name
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
# The same rows run.sh writes, so the run history shows launches too
record() {
  jq -nc --arg w "$(date '+%F %H:%M')" --arg o "$1" --arg t "$TICKET" --arg d "${2:-}" \
    '{when: $w, outcome: $o, ticket: $t, detail: $d}' >> "$HOME_DIR/runs.jsonl" 2>/dev/null || true
}

# The container only (COD-657): its tmpfs keys and deny rules are what this session's permissions
# assume. run.sh launches nothing elsewhere; this is the backstop, before the lock and with no notice.
if [[ "${AGENT_QUEUE_HOST:-}" != container ]]; then
  note "fail: implement runs only in the container; not starting"
  record failed "$KEY · implement runs only in the container"
  exit 1
fi

STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# One row for the launch in the telemetry database; a no-op without the env vars. attended is false:
# nobody sits at this session. It runs detached from the scheduler, so waiting on the call is fine.
telemetry() {
  telemetry_run "$STARTED" "$1" "$TICKET" "$2" false implement "" "" "" || true
}

# One session at a time; run.sh reads this lock as `locked`. It holds this script's pid, so
# run.sh clears it only when its owner is gone, and only the owner removes it.
LOCK="$HOME_DIR/implement.lock"
if ! mkdir "$LOCK" 2>/dev/null; then note "busy: a session is running"; exit 0; fi
# The session's wait.sh writes its `waiting` marker here, under the other user
chgrp queue "$LOCK" 2>/dev/null && chmod 2770 "$LOCK" || true
print -r -- "$$" > "$LOCK/pid"
# The launch key beside the pid, for a deploy that names what it would interrupt
[[ -n "$KEY" ]] && print -r -- "$KEY" > "$LOCK/key"
trap '[[ "$(cat "$LOCK/pid" 2>/dev/null)" == "$$" ]] && rm -rf "$LOCK"' EXIT

# The app identity, read from the agent checkout's tools/cdwr/.env (install refreshes that
# copy). It fails closed, with the reason on stderr, and comes before the reservation so a
# session that never starts costs nothing.
source "${0:A:h}/github-app.sh"
source "${0:A:h}/telemetry.sh"
source "${0:A:h}/lib.sh"
telemetry_env "$REPO/tools/cdwr/.env"
errf="$LOGS/github-app.err"
if ! { app_env "$REPO/tools/cdwr/.env" && app_session; } 2> "$errf"; then
  reason="$(tr '\n' ' ' < "$errf" | sed 's/ *$//')"
  rm -f "$errf"
  note "fail: $reason; not starting"
  notify "Agent queue: nothing launched for $TICKET. $reason."
  record failed "$KEY · $reason"
  telemetry failed "$KEY · $reason"
  exit 1
fi
rm -f "$errf"

# Without Linear the session can read no ticket, so it does not start and reserves nothing
linear_mcp "$HOME_DIR"
if ! linear_gate "$HOME_DIR"; then
  note "fail: no Linear tools ($linear_why); not starting"
  $linear_new && notify "Agent queue: nothing launched for $TICKET. No Linear tools ($linear_why)."
  record failed "$KEY · no Linear tools ($linear_why)"
  telemetry failed "$KEY · no Linear tools ($linear_why)"
  exit 1
fi
# The Linear tools the session may call: linear-tools.txt, the list the container's proxy allows
if ! linear_allow=("${(@f)$(linear_allowed)}"); then
  note "fail: no Linear tool list (linear-tools.txt); not starting"
  record failed "$KEY · no Linear tool list"
  telemetry failed "$KEY · no Linear tool list"
  exit 1
fi

# Reserve the whole budget before the session starts, so a machine that dies mid-session still
# counts it against the daily cap; the actual cost settles it afterwards. No reservation, no start.
# Both rows carry the reservation's day: a settle after midnight on the next day would leave that
# day negative, and run.sh would read a ledger it can't use (COD-686).
DAY="$(date +%F)"
ledger() {
  jq -nc --arg day "$DAY" --arg t "$TICKET" --argjson c "$1" --arg k "$2" \
    '{day: $day, ticket: $t, cost: $c, kind: $k}' >> "$HOME_DIR/implement-spend.jsonl"
}
if ! ledger "$BUDGET_USD" reserve 2>/dev/null; then
  note "fail: could not reserve the budget in the spend ledger; not starting"
  record failed "$KEY · spend ledger not writable"
  telemetry failed "$KEY · spend ledger not writable"
  exit 1
fi

cd "$REPO"
log="$LOGS/implement_$(date +%F_%H%M).log"
result="${log%.log}.json"
note "launch: $KEY → $log"
record launched "$KEY · log $log"

# Escapes from the allow list below, denied first (deny wins). git config and -c run any
# command through a pager, an ssh command or an alias; nx exec runs anything; a REST write or
# a GraphQL mutation outside the thread replies could merge, push to main or drop protection.
# A push to main is the skill's to never do; GitHub's branch rules still refuse it, this keeps
# the session from trying. Every force push goes through force-push.sh, which pins the lease to
# the ticket branch and its old head. A raw push takes no option at all: git accepts option
# clusters (-uf) and abbreviations (--mi), so a rule that lets -u through lets -uf through too,
# and a pattern can't tell a lease on the branch from one on anything else. That covers
# --force*, -f, --mirror, --delete and -d; a `+` refspec and a :branch delete are denied on their
# own. A rule is a regex with `*` as `.*`, so each push rule comes in a `git push` and a
# `git * push` form, and an argument is matched both right after `push` and after a space. `gh run` is
# allowed for `view` only, so a failed job's log can be read; a rerun stays with Håkan. pnpm
# `add` and `remove` are scoped to a `-C` directory like `install`: a planned dependency change
# is part of a step (COD-676 adds two font packages), and the lockfile goes through review.
DENY=(
  "Bash(git -c *)" "Bash(git -C * -c *)" "Bash(git * config *)" "Bash(git * --config-env*)"
  "Bash(git push * main)" "Bash(git push * main *)" "Bash(git push *:main*)" "Bash(git push *heads/main*)"
  "Bash(git * push * main)" "Bash(git * push * main *)" "Bash(git * push *:main*)" "Bash(git * push *heads/main*)"
  "Bash(git push -*)" "Bash(git push * -*)" "Bash(git * push -*)" "Bash(git * push * -*)"
  "Bash(git push +*)" "Bash(git push * +*)" "Bash(git * push +*)" "Bash(git * push * +*)"
  "Bash(git push * :*)" "Bash(git * push * :*)"
  "Bash(pnpm nx exec*)" "Bash(pnpm * nx exec*)"
  "Bash(gh pr merge*)" "Bash(gh pr close*)" "Bash(gh pr ready*)"
  # REST reads only; GraphQL goes through gh-review.sh, never raw
  "Bash(gh api graphql*)" "Bash(gh api * -X *)" "Bash(gh api * --method *)"
  "Bash(gh api * -f *)" "Bash(gh api * -F *)" "Bash(gh api * --field *)" "Bash(gh api * --raw-field *)"
  "Bash(gh api * --input*)" "Bash(gh api *@*)"
  # The container's keys live on its tmpfs; the Linear key reaches only the MCP's header helper
  "Read(//run/agent/**)" "Bash(*/run/agent/*)" "Bash(*lib.sh*)"
  # Every process's environ and memory, the entrypoint's and tini's included (COD-657). Read rules
  # cover Grep and Glob too
  "Read(//proc/**)" "Bash(*/proc/*)"
  # The checkouts' cdwr env, which holds the Supabase service key; worktrees get no copy here
  "Read(//**/tools/cdwr/.env)" "Bash(*tools/cdwr/.env*)"
  # The Mac's token cache and the app's credentials files stay out of the session too
  "Read(/$HOME_DIR/linear.token*)" "Bash(*linear.token*)" "Bash(*linear-app.env*)" "Bash(*security find-generic-password*)" "Bash(*AGENT_QUEUE_LINEAR*)"
)
# The ticket worktrees sit beside the agent worktree; `//` anchors the rule at the root
WT="/${REPO:h}/codeware-cod-*/**"
rc=0
claude_pid=
interrupted=false
# A stop (the container shutting down) reaches claude; the ledger and the lock are settled below.
# The flag tells the outcome below that the session was cut short, not that it failed.
# The session's claude is sudo's child under another user, which this user can't signal, and
# sudo itself runs as root: the stop goes through its own crossing. Without a child (the specs
# launch claude itself) the pid is claude's own.
stop_session() {
  local child
  [[ -n "$claude_pid" ]] || return 0
  child="$(pgrep -P "$claude_pid" 2>/dev/null | head -n 1)"
  if [[ "$child" == <-> ]]; then
    ${=AGENT_QUEUE_SESSION_STOP:-sudo -n -u session /opt/agent-host/session-stop.sh} "$child" 2>/dev/null || true
  else
    kill -TERM "$claude_pid" 2>/dev/null || true
  fi
}
trap 'interrupted=true; stop_session' TERM INT
# The session hook tells the sessions table what kind this is
export AGENT_QUEUE_SESSION_KIND=implement
prompt="/work-queue implement-only once"
[[ -n "$KEY" ]] && prompt+=" key=\"$KEY\""
# The session runs as its own user: sudo keeps only what the sudoers file lists, and the launcher
# sets the rest (the session's home, the queue home it reads, its clone, its credential helper).
# The container's tmpfs keys, this checkout's .env and the queue home's writes stay the queue
# user's. AGENT_QUEUE_SESSION_LAUNCH replaces the launcher in the specs, which have no sudo.
typeset -a launch
launch=(${=AGENT_QUEUE_SESSION_LAUNCH:-sudo -n -u session /opt/agent-host/session-launch.sh})
"${claude_env[@]}" ENABLE_TOOL_SEARCH=false "${launch[@]}" -p "$prompt" \
  --model opus "${LINEAR_MCP_ARGS[@]}" \
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
    "Bash(git *)" "Bash(gh pr *)" "Bash(gh run view *)" "Bash(gh api repos/codeware-sthlm/cdwr/*)" \
    "Bash(tools/cdwr/agent-queue/gh-review.sh *)" "Bash(tools/cdwr/agent-queue/linear-upload.sh *)" \
    "Bash(tools/cdwr/agent-queue/force-push.sh *)" "Bash(tools/cdwr/agent-queue/review-diff.sh *)" \
    "Bash(pnpm nx *)" "Bash(pnpm -C * nx *)" "Bash(pnpm -C * vitest *)" "Bash(pnpm -C * install*)" \
    "Bash(pnpm -C * add *)" "Bash(pnpm -C * remove *)" \
    "Bash(pnpm cdwr agent worktree *)" \
    "Bash(jq *)" "Bash(uuidgen*)" "Bash(cut *)" "Bash(date *)" "Bash(wc -c *)" \
    "Bash(tools/cdwr/agent-queue/session.sh register)" "Bash(tools/cdwr/agent-queue/session.sh ticket *)" "Bash(tools/cdwr/agent-queue/session.sh id)" \
    "Bash(tools/cdwr/agent-queue/wait.sh*)" \
    "Bash(tools/cdwr/agent-queue/notify.sh *)" "Bash(~/.claude/hooks/notify-slack.sh)" "Bash($HOME/.claude/hooks/notify-slack.sh)" \
    "${linear_allow[@]/#/${L}__}" \
  > "$result" 2> "$log" &
claude_pid=$!
wait $claude_pid || rc=$?
# wait returns early on a trapped signal; let claude finish
ps -p $claude_pid >/dev/null 2>&1 && { wait $claude_pid || rc=$?; }
claude_pid=

jq -r '.result // empty, (.errors // [])[]' "$result" >> "$log" 2>/dev/null || cat "$result" >> "$log"
cost="$(jq -r '.total_cost_usd // empty' "$result" 2>/dev/null || true)"
# No result (a crash or a kill) keeps the full reservation, so failing launches still meet the cap
[[ "$cost" == <->(|.<->) ]] || cost="$BUDGET_USD"
# Settle the reservation to the actual cost. The daily cap reads this ledger, not the hourly usage
# rows, so two launches can't slip through.
settle="$(jq -n --argjson c "$cost" --argjson b "$BUDGET_USD" '$c - $b')"
[[ "$settle" == 0 ]] || ledger "$settle" settle 2>/dev/null || note "warn: could not settle the spend ledger"
spent=" · \$$(printf '%.2f' "$cost") in $(jq -r '.num_turns // "?"' "$result" 2>/dev/null || print '?') turns"

# A session that could not take its key ends with `not tried: <key> · <reason>`; one whose code
# review could not run ends with `review failed: <key> · <reason>` and opened no PR
last=
(( rc == 0 )) && last="$({ jq -r '.result // empty' "$result" 2>/dev/null || true; } | awk 'NF {l = $0} END {print l}')"

if $interrupted; then
  # A deploy or container stop is not a failure, so it never counts toward the two-miss stop:
  # the launch is given back once per key, as for `not tried`, and nobody is notified
  if [[ "$(jq -r '.key // empty' "$HOME_DIR/launch.json" 2>/dev/null)" == "$KEY" ]]; then
    jq -c 'if .refunded then . else .launches = ([(.launches // 0) - 1, 0] | max) | .refunded = true end' \
      "$HOME_DIR/launch.json" > "$HOME_DIR/launch.json.tmp.$$" 2>/dev/null &&
      mv "$HOME_DIR/launch.json.tmp.$$" "$HOME_DIR/launch.json" 2>/dev/null || rm -f "$HOME_DIR/launch.json.tmp.$$" 2>/dev/null || true
  fi
  note "interrupted: $KEY$spent"
  record interrupted "$KEY · stopped by a container stop or deploy$spent · log $log"
  telemetry interrupted "$KEY · stopped by a container stop or deploy$spent · log $log"
elif [[ -n "$KEY" && "$last" == "not tried: $KEY"( · *|) ]]; then
  # The launch changed nothing by design: give it back once per key, so the next pick may launch
  # it again, and a session that keeps declining still meets the two-miss stop
  if [[ "$(jq -r '.key // empty' "$HOME_DIR/launch.json" 2>/dev/null)" == "$KEY" ]]; then
    jq -c 'if .refunded then . else .launches = ([(.launches // 0) - 1, 0] | max) | .refunded = true end' \
      "$HOME_DIR/launch.json" > "$HOME_DIR/launch.json.tmp.$$" 2>/dev/null &&
      mv "$HOME_DIR/launch.json.tmp.$$" "$HOME_DIR/launch.json" 2>/dev/null || rm -f "$HOME_DIR/launch.json.tmp.$$" 2>/dev/null || true
  fi
  reason="${${last#not tried: $KEY}# · }"
  [[ -n "$reason" ]] || reason="no reason given"
  note "untried: $KEY · $reason"
  record untried "$KEY · $reason$spent · log $log"
  telemetry untried "$KEY · $reason$spent · log $log"
elif [[ -n "$KEY" && "$last" == "review failed: $KEY"( · *|) ]]; then
  # The session stopped short of its PR because the review could not run. A failure, so the desk
  # shows the gap and the two-miss stop holds a run that keeps failing; the launch is not given back
  reason="${${last#review failed: $KEY}# · }"
  [[ -n "$reason" ]] || reason="no reason given"
  note "fail: review could not run on $KEY · $reason"
  notify "Agent queue: the code review could not run on $TICKET ($reason), so no PR was opened. Log: $log"
  record failed "$KEY · review could not run: $reason$spent · log $log"
  telemetry failed "$KEY · review could not run: $reason$spent · log $log"
elif (( rc != 0 )) && limit_hold "$result"; then
  # The plan's session limit: the session never worked and nothing failed on our side. The launch
  # is given back every time, so a limit never counts toward the two-miss stop; run.sh holds every
  # launch until the reset. One info notice per hold, no failure notice.
  if [[ "$(jq -r '.key // empty' "$HOME_DIR/launch.json" 2>/dev/null)" == "$KEY" ]]; then
    jq -c '.launches = ([(.launches // 0) - 1, 0] | max)' \
      "$HOME_DIR/launch.json" > "$HOME_DIR/launch.json.tmp.$$" 2>/dev/null &&
      mv "$HOME_DIR/launch.json.tmp.$$" "$HOME_DIR/launch.json" 2>/dev/null || rm -f "$HOME_DIR/launch.json.tmp.$$" 2>/dev/null || true
  fi
  note "limited: $KEY · $LIMIT_TEXT"
  if $LIMIT_NEW && [[ "$(tr -d '[:space:]' 2>/dev/null < "$HOME_DIR/notify-level" || true)" != action ]]; then
    notify "Agent queue: session limit reached, launches held until $(limit_held || print 'the reset')"
  fi
  record limited "$KEY · $LIMIT_TEXT$spent · log $log"
  telemetry limited "$KEY · $LIMIT_TEXT$spent · log $log"
elif (( rc == 0 )); then
  note "done: $KEY$spent"
  record implemented "$KEY$spent · log $log"
  telemetry implemented "$KEY$spent · log $log"
elif [[ "$(jq -r '.subtype // empty' "$result" 2>/dev/null)" == error_max_budget_usd ]]; then
  note "cap: stopped at the \$$BUDGET_USD budget (see $log)"
  notify "Agent queue: an implementing session on $TICKET hit the \$$BUDGET_USD cap and stopped. Log: $log"
  record cap "$KEY · stopped at the \$$BUDGET_USD budget, log $log"
  telemetry cap "$KEY · stopped at the \$$BUDGET_USD budget, log $log"
else
  note "fail: claude exited $rc (see $log)"
  notify "Agent queue: an implementing session on $TICKET failed (exit $rc). Log: $log"
  record failed "$KEY · claude exited $rc, log $log$spent"
  telemetry failed "$KEY · claude exited $rc, log $log$spent"
fi

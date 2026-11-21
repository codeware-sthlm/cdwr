#!/bin/zsh
# The container's side of the NUC's self-deploy (apps/agent-host/nuc/self-deploy.sh), which runs on
# the host and reaches in only through `docker exec cdwr-agent /opt/agent-queue/deploy-gate.sh <cmd>`:
#   state           none, waiting or working: the lock rules `cdwr agent deploy` reads over ssh
#   pause           touch the paused file; prints `created` when it made it, `kept` when it was there
#   unpause         remove the paused file
#   job             print job.json, nothing when there is none
#   record          write deploy.json for the desk from the JSON object on stdin
#   notify <text>   an urgent notice through notify.sh, from the source self-deploy
# Every subcommand only reads or writes files in the queue home; the host gets no shell in here.
# DEPLOY_GATE_PROC replaces /proc in specs.

setopt no_unset pipe_fail

HOME_DIR="${AGENT_QUEUE_HOME:-$HOME/.cdwr/agent-queue}"
PROC="${DEPLOY_GATE_PROC:-/proc}"
HERE="${0:A:h}"

# A lock is held while the pid its owner wrote lives; without a pid yet, while it is under a minute
# old, since the owner may be between mkdir and write. Mirrors deploy.ts and run.sh.
held() {
  local lock=$1 pid
  [[ -e "$lock" ]] || return 1
  pid="$(cat "$lock/pid" 2>/dev/null)" || pid=""
  if [[ "$pid" == <-> ]]; then
    [[ -d "$PROC/$pid" ]]
    return
  fi
  [[ -z "$(find "$lock" -maxdepth 0 -mmin +1 2>/dev/null)" ]]
}

state() {
  local lock="$HOME_DIR/implement.lock" waiting
  if held "$HOME_DIR/lock"; then print working; return 0; fi
  if ! held "$lock"; then print none; return 0; fi
  # A session polling in wait.sh is safe to interrupt: the next tick resumes it
  waiting="$(cat "$lock/waiting" 2>/dev/null)" || waiting=""
  if [[ "$waiting" == <-> && -r "$PROC/$waiting/cmdline" ]] && grep -qa wait.sh "$PROC/$waiting/cmdline"; then
    print waiting
  else
    print working
  fi
}

pause() {
  if [[ -e "$HOME_DIR/paused" ]]; then print kept; return 0; fi
  touch "$HOME_DIR/paused" && print created
}

record() {
  local body
  # Only the known fields, each a string or null, so the desk never reads anything else
  body="$(jq -c '
    def s: if type == "string" then . else null end;
    if type != "object" then error("not an object") else . end
    | {tag: (.tag | s), previous: (.previous | s), at: (.at | s), by: (.by | s),
       phase: (.phase | s), reason: (.reason | s), failed: (.failed | s)}')" && [[ -n "$body" ]] || {
    print -ru2 -- "deploy-gate: record takes a JSON object on stdin"
    return 2
  }
  print -r -- "$body" > "$HOME_DIR/deploy.json.tmp" && mv -f "$HOME_DIR/deploy.json.tmp" "$HOME_DIR/deploy.json"
}

case "${1:-}" in
  state) state ;;
  pause) pause ;;
  unpause) rm -f "$HOME_DIR/paused" ;;
  job) [[ -f "$HOME_DIR/job.json" ]] && cat "$HOME_DIR/job.json"; exit 0 ;;
  record) record ;;
  notify)
    shift
    (( $# )) || { print -ru2 -- "deploy-gate: notify takes a message"; exit 2; }
    "$HERE/notify.sh" --level urgent --source self-deploy "$*"
    ;;
  *)
    print -ru2 -- "usage: deploy-gate.sh state|pause|unpause|job|record|notify <text>"
    exit 2
    ;;
esac

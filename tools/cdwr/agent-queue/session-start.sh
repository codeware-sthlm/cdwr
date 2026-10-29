#!/bin/zsh
# SessionStart hook: warns when a detached checkout is behind origin/main, which is how an
# unattended run leaves it. Registered in .claude/settings.json; the payload on stdin is ignored.
# Prints nothing unless behind, always exits 0, so a failure never blocks a session.
exec 2>/dev/null
cat >/dev/null
# A session the scheduler launched has nobody to tell, and run.sh moves its checkout itself
[[ -n "${AGENT_QUEUE_SESSION_KIND:-}${AGENT_QUEUE_ENV_FILE:-}" ]] && exit 0

dir="${CLAUDE_PROJECT_DIR:-${0:A:h}/../../..}"
cd "$dir" || exit 0
# On a branch the checkout is somebody's work; leave it be
git symbolic-ref -q HEAD >/dev/null && exit 0

# A fetch that stalls is killed after 5 s; the existing origin/main ref then stands
git fetch -q origin main >/dev/null 2>&1 &
fetch=$!
( sleep 5; kill $fetch ) >/dev/null 2>&1 &
guard=$!
wait $fetch
kill $guard 2>/dev/null
wait $guard 2>/dev/null

behind="$(git rev-list --count HEAD..origin/main 2>/dev/null)"
[[ "$behind" == <-> ]] && (( behind > 0 )) || exit 0

# attend refreshes codeware-queue on its own; any other checkout needs naming
named=""; [[ "${dir:A:t}" == codeware-queue ]] || named="${dir:A}"
jq -n --arg n "$behind" --arg named "$named" '
  (if $n == "1" then "1 commit" else "\($n) commits" end) as $count
  | (if $named == "" then "" else " --path \($named | @sh)" end) as $flag
  | "This checkout is \($count) behind origin/main. Exit and run `cdwr agent attend\($flag)`." as $how
  | {
      systemMessage: $how,
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: "Tell the user before taking any work: \($how)"
      }
    }' || true
exit 0

#!/bin/zsh
# Marker for the work-queue session heartbeat: `session.sh register` does nothing itself.
# The PostToolUse hook (session-hook.sh) sees this command in the tool input and writes the
# session file, since only hooks are told the session id.
case "${1:-}" in
  register) print -r -- "registered work-queue session" ;;
  *) print -ru2 -- "usage: session.sh register"; exit 2 ;;
esac

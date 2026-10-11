#!/bin/zsh
# Markers for the work-queue session heartbeat: `session.sh register` and `session.sh ticket`
# do nothing themselves. The PostToolUse hook (session-hook.sh) sees the line they print and
# writes the session file, since only hooks are told the session id.
usage() { print -ru2 -- "usage: session.sh register | session.sh ticket <COD-n | ->"; exit 2 }
case "${1:-}" in
  register) print -r -- "registered work-queue session" ;;
  ticket)
    case "${2:-}" in
      COD-<->|-) print -r -- "work-queue ticket $2" ;;
      *) usage ;;
    esac ;;
  *) usage ;;
esac

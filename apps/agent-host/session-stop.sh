#!/bin/zsh
# Stops an implement session's claude: implement.sh runs it as `session` through sudo, since the
# launcher's own sudo runs as root and the queue's user can signal neither it nor the session's
# processes. Takes one pid; as `session` it reaches that user's processes and no other.
setopt err_exit no_unset
[[ "${1:-}" == <-> ]] || { print -ru2 -- "usage: session-stop.sh <pid>"; exit 2 }
kill -TERM "$1"

#!/bin/zsh
# The devlog skill's cms commands, `covered …` and `draft --file <post.md> …` as `cdwr devlog` takes
# them. In the container the session holds no cms key: the post goes on stdin, through sudo, to the
# queue user's crossing (apps/agent-host/devlog-cms.sh). Elsewhere the CLI runs here.
setopt err_exit pipe_fail no_unset

if [[ "${AGENT_QUEUE_HOST:-}" != container ]]; then
  exec node "${0:A:h:h:h:h}/tools/cdwr/bin/cdwr.mjs" devlog "$@"
fi

# AGENT_QUEUE_DEVLOG_CROSSING replaces the crossing in the specs, which have no sudo
typeset -a crossing rest
crossing=(${=AGENT_QUEUE_DEVLOG_CROSSING:-sudo -n -u agent /opt/agent-host/devlog-cms.sh})
[[ "${1:-}" == draft ]] || exec "${crossing[@]}" "$@" </dev/null
shift
file=
while (( $# )); do
  case "$1" in
    --file) file="${2:-}"; (( $# >= 2 )) && shift 2 || shift ;;
    *) rest+=("$1"); shift ;;
  esac
done
[[ -n "$file" && -r "$file" ]] || { print -ru2 -- "devlog.sh: draft needs --file <post.md>"; exit 2; }
exec "${crossing[@]}" draft "${rest[@]}" < "$file"

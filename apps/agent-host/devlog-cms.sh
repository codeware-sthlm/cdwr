#!/bin/zsh
# The devlog run's cms commands, run as the queue's user: the session crosses here through sudo
# (tools/cdwr/agent-queue/devlog.sh), since the cms key stays with this user. It takes
# `covered [--no-check] [--json]` or `draft --covers <n,n> [--dry-run] [--yes] [--json]` with the
# post's markdown on stdin, never a path: a path would let the session have this user read and post
# a file only this user can read. Owned by root in the image; its paths are the image's, since sudo
# resets the environment.
setopt err_exit pipe_fail no_unset

export HOME=/home/agent CDWR_HOME=/home/agent/.cdwr
export PATH=/usr/local/bin:/usr/bin:/bin
repo=/work/codeware-agent
vault="${AGENT_QUEUE_VAULT_FILE:-/run/agent/vault.env}"

usage() {
  print -ru2 -- "usage: devlog-cms.sh covered [--no-check] [--json] | draft --covers <n,n> [--dry-run] [--yes] [--json] < post.md"
  exit 2
}

typeset -a args
case "${1:-}" in
  covered)
    args=(covered)
    shift
    for a in "$@"; do
      case "$a" in
        --no-check | --json) args+=("$a") ;;
        *) usage ;;
      esac
    done
    ;;
  draft)
    args=(draft)
    shift
    covers=
    while (( $# )); do
      case "$1" in
        --covers)
          [[ "${2:-}" =~ '^[0-9]+(,[0-9]+)*$' ]] || usage
          covers="$2"
          shift 2
          ;;
        --dry-run | --yes | --json) args+=("$1"); shift ;;
        *) usage ;;
      esac
    done
    [[ -n "$covers" ]] || usage
    ;;
  *) usage ;;
esac

# The cms values from the vault file, read as text; the checkout's .env, which the CLI reads
# itself, fills what the vault leaves out
if [[ -r "$vault" ]]; then
  for line in "${(@f)$(<"$vault")}"; do
    [[ "$line" == (CMS_URL|CMS_AGENT_API_KEY|CMS_SIGNATURE_SECRET)=* ]] && export "$line"
  done
fi

cd "$repo"
[[ "${args[1]}" == covered ]] && exec node tools/cdwr/bin/cdwr.mjs devlog "${args[@]}" </dev/null

# The post goes to a file only this user can read, which the CLI reads like any other
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# A post past the limit is refused, never cut short
head -c 200001 > "$tmp/post.md"
if (( $(wc -c < "$tmp/post.md") > 200000 )); then
  print -ru2 -- "devlog-cms.sh: the post is over 200000 bytes"
  exit 2
fi
node tools/cdwr/bin/cdwr.mjs devlog "${args[@]}" --file "$tmp/post.md" --covers "$covers" </dev/null

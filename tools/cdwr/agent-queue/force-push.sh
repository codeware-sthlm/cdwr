#!/bin/zsh
# The only force push a session may run: a ticket branch rebased in its worktree, pushed with a
# lease on the head it had before the rebase (the skill's "A PR that conflicts with main").
# A Bash rule can't pin a lease to a ref and a sha, so settings.json and implement.sh allow this
# script instead, and it builds the one push itself from arguments it checks first.
#   force-push.sh <worktree> <branch> <old head>
set -euo pipefail
setopt extended_glob

usage() { print -ru2 -- "usage: force-push.sh <worktree> <branch> <old head>"; exit 2 }
refuse() { print -ru2 -- "force-push.sh: $*"; exit 2 }
(( $# == 3 )) || usage

wt="${1:A}"; branch="$2"; old="$3"
[[ "$wt" == */codeware-cod-(#b)(<->) && -d "$wt" ]] || refuse "not a ticket worktree: $wt"
ticket="$match[1]"
# Linear's branch name for the same ticket: no main, no options, no `+` or `:` refspecs
[[ "$branch" == cod-$ticket-[a-z0-9-]## ]] || refuse "not the branch of cod-$ticket: $branch"
[[ "$old" == [0-9a-f](#c40) ]] || refuse "not a full commit sha: $old"
# HEAD is what gets pushed, so it must be that branch
head="$(git -C "$wt" symbolic-ref --quiet --short HEAD)" || refuse "no branch checked out in $wt"
[[ "$head" == "$branch" ]] || refuse "$wt has $head checked out, not $branch"

git -C "$wt" push --force-with-lease="refs/heads/$branch:$old" origin "HEAD:refs/heads/$branch"

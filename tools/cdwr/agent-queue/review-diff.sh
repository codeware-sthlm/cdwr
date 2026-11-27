#!/bin/zsh
# The diff a session's code review reads: everything a ticket worktree holds beyond origin/main,
# committed or not, untracked files included, as one diff against the merge base, written into
# the worktree's git dir, where nothing commits it. An implement run gets its own
# `git diff origin/main...HEAD` and `git diff <path>` denied in practice (the implement-run
# memory), whatever the `Bash(git *)` rule says, and may not pipe git into a file, so
# settings.json and implement.sh allow this script instead.
# It also prints the PR-ready comment's Merge line (guard.jq `hold_check_lines`): the diff's
# files against the hold-paths.txt on origin/main, the list the watch reads too, never the
# branch's own copy. The session can't run that jq call itself.
#   review-diff.sh <worktree>    prints the path of the diff it wrote, then the Merge line
set -euo pipefail
setopt extended_glob

usage() { print -ru2 -- "usage: review-diff.sh <worktree>"; exit 2 }
refuse() { print -ru2 -- "review-diff.sh: $*"; exit 2 }
(( $# == 1 )) || usage

wt="${1:A}"
[[ "$wt" == */codeware-cod-(#b)(<->) && -d "$wt" ]] || refuse "not a ticket worktree: $wt"
ticket="$match[1]"
head="$(git -C "$wt" symbolic-ref --quiet --short HEAD)" || refuse "no branch checked out in $wt"
[[ "$head" == cod-$ticket-[a-z0-9-]## ]] || refuse "$wt has $head checked out, not a branch of cod-$ticket"
# A linked worktree's git dir is its own, under the main checkout's .git/worktrees
dir="$(git -C "$wt" rev-parse --path-format=absolute --git-dir)"
# Best effort: a blip at GitHub leaves the last fetched origin/main, which is still a diff worth reading
git -C "$wt" fetch --quiet origin main ||
  print -ru2 -- "review-diff.sh: fetch failed, diffing against the last fetched origin/main"
base="$(git -C "$wt" merge-base origin/main HEAD)" || refuse "no merge base with origin/main in $wt"
out="$dir/review.diff"
trap 'rm -f "$out.$$"' EXIT
{
  # Fixed prefixes, whatever the host's diff config says: the Merge line reads `a/` and `b/`
  git -C "$wt" diff --src-prefix=a/ --dst-prefix=b/ "$base"
  # Untracked files, which no diff against a commit shows; --no-index exits 1 on a difference
  git -C "$wt" ls-files --others --exclude-standard -z | while IFS= read -r -d '' file; do
    git -C "$wt" diff --no-index --src-prefix=a/ --dst-prefix=b/ -- /dev/null "$file" || true
  done
} > "$out.$$"
mv -f "$out.$$" "$out"
print -r -- "$out"
here="${0:A:h}"
if [[ ! -r "$here/guard.jq" ]]; then
  print -r -- "Merge: held: no guard.jq beside review-diff.sh"
elif ! list="$(git -C "$wt" show origin/main:tools/cdwr/agent-queue/hold-paths.txt 2>/dev/null)"; then
  print -r -- "Merge: held: no hold list on origin/main"
else
  { print -r -- "$list"; cat "$out" } | jq -nrR -L "$here" 'include "guard"; hold_check_lines([inputs])' ||
    print -r -- "Merge: held: the hold list could not be read"
fi

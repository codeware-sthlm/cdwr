#!/bin/zsh
# The only GitHub GraphQL an implement-only session may run: list a PR's open review threads,
# reply in one, resolve one. implement.sh allows this script and no raw `gh api graphql`, since
# a query can come from a file or stdin, where no deny pattern sees the mutation in it.
#   gh-review.sh threads <pr> | reply <thread id> <body> | resolve <thread id>
set -euo pipefail

usage() { print -ru2 -- "usage: gh-review.sh threads <pr> | reply <thread id> <body> | resolve <thread id>"; exit 2 }
thread() { [[ "${1:-}" == PRRT_[A-Za-z0-9_-]## ]] || { print -ru2 -- "gh-review.sh: not a review thread id: ${1:-}"; exit 2; } }
setopt extended_glob

case "${1:-}" in
  threads)
    [[ "${2:-}" == <-> ]] || usage
    gh api graphql -F n="$2" -f query='query($n:Int!){repository(owner:"codeware-sthlm",name:"cdwr"){pullRequest(number:$n){reviewThreads(first:100){nodes{id isResolved path line comments(first:20){nodes{author{login} body}}}}}}}' ;;
  reply)
    thread "${2:-}"; [[ -n "${3:-}" ]] || usage
    gh api graphql -F t="$2" -f b="$3" -f query='mutation($t:ID!,$b:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$t,body:$b}){comment{id}}}' ;;
  resolve)
    thread "${2:-}"
    gh api graphql -F t="$2" -f query='mutation($t:ID!){resolveReviewThread(input:{threadId:$t}){thread{isResolved}}}' ;;
  *) usage ;;
esac

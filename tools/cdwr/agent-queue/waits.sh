#!/bin/zsh
# Shared by run.sh and wait.sh: what parked tickets wait for, read from GitHub.
# Read-only on purpose: gh reads only (one gh api graphql query), no mutation belongs here.
# Needs watch.jq beside it; AGENT_QUEUE_GH_CMD replaces the gh call with a command that prints a response.
WAITS_DIR="${0:A:h}"

# gh_read <gh command…>: runs a gh read; when it fails with an App token set (the App may lack a
# permission), retries once as the signed-in user and notes it once per run (a file keyed on the
# run's pid, since reads run in subshells; run.sh removes it on exit).
gh_read() {
  local flag="${LOGS:-}/gh-read-fallback.$$" out rc
  out="$("$@")"; rc=$?
  if (( rc != 0 )) && [[ -n "${GH_TOKEN:-}" ]]; then
    out="$(GH_TOKEN= GITHUB_TOKEN= "$@")"; rc=$?
    if [[ -n "${LOGS:-}" && ! -e "$flag" ]]; then
      : > "$flag"
      (( $+functions[note] )) && note "warn: GitHub read fell back to the signed-in user"
    fi
  fi
  print -r -- "$out"
  return $rc
}

# gh_query <graphql query>
gh_query() {
  if [[ -n "${AGENT_QUEUE_GH_CMD:-}" ]]; then eval "$AGENT_QUEUE_GH_CMD"
  else gh_read gh api graphql -f query="$1"
  fi
}

# parked_waits: reads the ATTENDED_QUERY response on stdin, prints { "COD-1": { reviewed, rollup, oid } }
# for each parked ticket. Any failure prints {}, which leaves every wait pending.
parked_waits() {
  setopt local_options no_err_exit
  local resp tickets query out
  resp="$(cat)"
  tickets="$(jq -c -L "$WAITS_DIR" 'include "watch";
    [ .data.issues.nodes[] | select(other_repo | not)
      | select((agent_label == "agent:working" or agent_label == "agent:review") and is_open and parked != null)
      | { ticket: .identifier, pr: parked.pr } ]' <<<"$resp" 2>/dev/null)" || { print -r -- '{}'; return 0; }
  [[ "$(jq 'length' <<<"$tickets" 2>/dev/null)" -gt 0 ]] 2>/dev/null || { print -r -- '{}'; return 0; }
  query="$(jq -r '"query { repository(owner: \"codeware-sthlm\", name: \"cdwr\") { "
    + ([ to_entries[] | "t\(.key): pullRequest(number: \(.value.pr)) { reviews(first: 50) { nodes { author { login } } } commits(last: 1) { nodes { commit { oid statusCheckRollup { state } } } } }" ] | join(" "))
    + " } }"' <<<"$tickets")" || { print -r -- '{}'; return 0; }
  out="$(gh_query "$query" 2>/dev/null)" || { print -r -- '{}'; return 0; }
  jq -ec --argjson t "$tickets" '
    (.data.repository | objects) as $repo
    | $t | to_entries
    | map({ key: .value.ticket,
            value: ($repo["t\(.key)"] | {
              reviewed: ([ .reviews.nodes[]?.author.login // empty | startswith("copilot-pull-request-reviewer") ] | any),
              rollup: ((.commits.nodes // [] | last | .commit.statusCheckRollup.state) // null),
              oid: ((.commits.nodes // [] | last | .commit.oid) // null) }) })
    | from_entries' <<<"$out" 2>/dev/null || print -r -- '{}'
  return 0
}

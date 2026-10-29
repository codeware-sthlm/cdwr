#!/bin/zsh
# Shared by run.sh and wait.sh: the Linear key, the GraphQL call and the attended query.
# Read-only on purpose: no gh call and no mutation belong here.

# The key comes from AGENT_QUEUE_LINEAR_KEY; on macOS the Keychain is the fallback
key="${AGENT_QUEUE_LINEAR_KEY:-}"
if [[ -z "$key" && "$(uname)" == Darwin ]]; then
  key="$(security find-generic-password -s linear-agent-queue -w 2>/dev/null || true)"
fi

# linear <query> [variables as JSON]
linear() {
  local vars="${2:-}"; [[ -z "$vars" ]] && vars='{}'
  jq -n --arg q "$1" --argjson v "$vars" '{query: $q, variables: $v}' |
    curl -sS -m 20 https://api.linear.app/graphql \
      -H "Authorization: $key" -H 'Content-Type: application/json' --data @-
}

# offline: Linear's host does not resolve, as on a dark wake from sleep; Linear itself is not down
offline() {
  [[ -z "${AGENT_QUEUE_LINEAR_CMD:-}" ]] || return 1
  curl -sS -m 5 -o /dev/null -I https://api.linear.app 2>/dev/null
  (( $? == 6 ))
}

# The queue the attended pick is computed from (see watch.jq `attended`)
read -r -d '' ATTENDED_QUERY <<'GQL' || true
query {
  issues(first: 100, filter: {
    team: { key: { eq: "COD" } }
    labels: { some: { name: { startsWith: "agent:" } } }
    state: { type: { neq: "canceled" } }
    or: [{ completedAt: { null: true } }, { completedAt: { gt: "-P14D" } }]
  }) { ...queued }
  # Only what watch.jq `to_label` reads: no description or comments for issues it merely checks
  subissues: issues(first: 100, filter: {
    team: { key: { eq: "COD" } }
    parent: { null: false }
    state: { type: { nin: ["completed", "canceled"] } }
  }) {
    nodes {
      identifier priority createdAt
      parent { identifier state { type } }
      state { type }
      labels(first: 20) { nodes { name } }
      inverseRelations(first: 20) {
        nodes { type issue { identifier state { type } labels(first: 20) { nodes { name } } } }
        pageInfo { hasNextPage }
      }
    }
  }
}
fragment queued on IssueConnection {
  nodes {
    identifier priority createdAt completedAt description
    parent { identifier state { type } }
    state { type }
    labels { nodes { name } }
    comments(first: 50, orderBy: createdAt) { nodes { body createdAt } }
    inverseRelations { nodes { type issue { identifier state { type } labels(first: 20) { nodes { name } } } } }
  }
}
GQL

# attended_nodes: appends the open sub-issues not already there to .data.issues.nodes, keeping
# Linear's order, so every reader of
# the attended response sees one list. A filter-level `or` would be one field, but Linear widens a
# nested `or` to the whole team.
attended_nodes() {
  # An error answer stays as it came, so it still reads as one
  jq -c 'if (.data.issues.nodes | type) == "array" then
      (.data.issues.nodes | map(.identifier)) as $have
      | .data.issues.nodes += [ (.data.subissues.nodes // [])[] | select(.identifier | IN($have[]) | not) ]
      | del(.data.subissues)
    else . end' 2>/dev/null
}

# host_id: the machine's stable name (a Mac's hostname follows the network); session-hook.sh has the twin
host_id() { [[ "$(uname)" == Darwin ]] && scutil --get LocalHostName 2>/dev/null || hostname -s; }

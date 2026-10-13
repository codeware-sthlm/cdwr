#!/bin/zsh
# Shared by run.sh and wait.sh: the Linear key, the GraphQL call and the attended query.
# Read-only on purpose: no gh call and no mutation belong here.

key="$(security find-generic-password -s linear-agent-queue -w 2>/dev/null || true)"

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
  }) {
    nodes {
      identifier priority createdAt completedAt description
      state { type }
      labels { nodes { name } }
      comments(first: 50, orderBy: createdAt) { nodes { body createdAt } }
      inverseRelations { nodes { type issue { state { type } } } }
    }
  }
}
GQL

#!/bin/zsh
# Shared by run.sh, implement.sh and wait.sh: the Linear key, the GraphQL call, the Linear MCP
# the claude runs use, and the attended query.
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
      -H @<(print -r -- "Authorization: $key") -H 'Content-Type: application/json' --data @-
}

# The Linear MCP the claude runs get. connector: the claude.ai connector of an interactive login,
# as on the Mac. key: Linear's own server signed with the key, for a host without that login, as
# the container; it is the default there. The key reaches neither argv nor a file: the header
# holds a placeholder that claude fills from its environment, and only claude's, through
# LINEAR_MCP_KEY on its command (empty in connector mode).
LINEAR_MCP="${AGENT_QUEUE_LINEAR_MCP:-}"
[[ -n "$LINEAR_MCP" ]] || { [[ "${AGENT_QUEUE_HOST:-}" == container ]] && LINEAR_MCP=key || LINEAR_MCP=connector; }
LINEAR_MCP_URL=https://mcp.linear.app/mcp

# linear_mcp <dir>: sets L, the tool prefix the allowlists use, LINEAR_MCP_ARGS, the claude
# flags that load the server, and LINEAR_MCP_KEY; key mode writes its config into <dir>
linear_mcp() {
  LINEAR_MCP_ARGS=() LINEAR_MCP_KEY=""
  if [[ "$LINEAR_MCP" == key ]]; then
    L=mcp__agent_linear
    jq -n --arg url "$LINEAR_MCP_URL" \
      '{mcpServers: {agent_linear: {type: "http", url: $url,
        headers: {Authorization: "Bearer ${AGENT_QUEUE_LINEAR_KEY}"}}}}' > "$1/linear-mcp.json"
    LINEAR_MCP_KEY="$key"
    LINEAR_MCP_ARGS=(--strict-mcp-config --mcp-config "$1/linear-mcp.json")
  else
    L=mcp__claude_ai_Linear
  fi
}

# linear_tools: prints why a claude run would have no Linear tools, nothing when it has them.
# AGENT_QUEUE_LINEAR_TOOLS_CMD replaces the check in specs.
linear_tools() {
  if [[ -n "${AGENT_QUEUE_LINEAR_TOOLS_CMD:-}" ]]; then eval "$AGENT_QUEUE_LINEAR_TOOLS_CMD"; return 0; fi
  local code
  case "$LINEAR_MCP" in
    key)
      [[ -n "$key" ]] || { print -r -- "key: no Linear API key"; return 0; }
      code="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' "$LINEAR_MCP_URL" \
        -H @<(print -r -- "Authorization: Bearer $key") \
        -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
        --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"agent-queue","version":"1"}}}' \
        2>/dev/null)" || true
      [[ "$code" == 200 ]] || print -r -- "key: Linear's MCP answered ${code:-nothing}" ;;
    connector)
      # From the queue home, so the repo's own .mcp.json servers are not health-checked
      ( cd "${HOME_DIR:-$HOME}" && claude mcp list 2>/dev/null ) | grep -q '^claude\.ai Linear: .*Connected' ||
        print -r -- "connector: the claude.ai Linear connector is not connected" ;;
    *) print -r -- "unknown AGENT_QUEUE_LINEAR_MCP=$LINEAR_MCP" ;;
  esac
}

# linear_gate <dir>: true when a claude run would have Linear tools. Otherwise sets linear_why, and
# linear_new=true the first time in a spell (<dir>/linear-missing marks it), so one notice goes out.
linear_gate() {
  linear_why="$(linear_tools)" linear_new=false
  if [[ -z "$linear_why" ]]; then rm -f "$1/linear-missing"; return 0; fi
  [[ -e "$1/linear-missing" ]] || { print -r -- "$linear_why" > "$1/linear-missing"; linear_new=true; }
  return 1
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

# host_id: the machine's stable name (a Mac's hostname follows the network); session-hook.sh has the twin
host_id() { [[ "$(uname)" == Darwin ]] && scutil --get LocalHostName 2>/dev/null || hostname -s; }

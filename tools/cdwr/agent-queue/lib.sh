#!/bin/zsh
# Shared by run.sh, implement.sh and wait.sh: the Linear key, the GraphQL call, the Linear MCP
# the claude runs use, and the attended query.
# Read-only on purpose: no gh call and no mutation belong here.

# The key comes from AGENT_QUEUE_LINEAR_KEY, then the file AGENT_QUEUE_LINEAR_KEY_FILE names (the
# container's), then on macOS the Keychain
LIB_SH="${${(%):-%x}:A}"
key="${AGENT_QUEUE_LINEAR_KEY:-}"
if [[ -z "$key" && -n "${AGENT_QUEUE_LINEAR_KEY_FILE:-}" && -r "$AGENT_QUEUE_LINEAR_KEY_FILE" ]]; then
  key="$(<"$AGENT_QUEUE_LINEAR_KEY_FILE")"
fi
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
# the container; it is the default there. The key reaches neither argv, the config nor claude's
# environment: claude runs under `claude_env`, and the config's headersHelper asks lib.sh for the
# header, which finds the key in the file or the Keychain.
LINEAR_MCP="${AGENT_QUEUE_LINEAR_MCP:-}"
[[ -n "$LINEAR_MCP" ]] || { [[ "${AGENT_QUEUE_HOST:-}" == container ]] && LINEAR_MCP=key || LINEAR_MCP=connector; }
LINEAR_MCP_URL=https://mcp.linear.app/mcp

# claude_env: the env prefix for every claude run, without the key; the session's wait.sh finds it
# the same way the helper does
claude_env=(env -u AGENT_QUEUE_LINEAR_KEY)

# linear_header: the MCP header as JSON, for the headersHelper; nothing without a key
linear_header() {
  [[ -n "$key" ]] || return 1
  jq -nc --arg k "Bearer $key" '{Authorization: $k}'
}

# The helper command, as claude's shell runs it: this file, run rather than sourced
LINEAR_HEADERS_HELPER="zsh ${(q)LIB_SH} header"

# linear_mcp <dir>: sets L, the tool prefix the allowlists use, and LINEAR_MCP_ARGS, the claude
# flags that load the server; key mode writes its config into <dir>.
linear_mcp() {
  LINEAR_MCP_ARGS=()
  if [[ "$LINEAR_MCP" == key ]]; then
    L=mcp__agent_linear
    # Renamed into place: the scheduler and a launched session may write it at once
    jq -n --arg url "$LINEAR_MCP_URL" --arg helper "$LINEAR_HEADERS_HELPER" \
      '{mcpServers: {agent_linear: {type: "http", url: $url, headersHelper: $helper}}}' > "$1/linear-mcp.json.$$"
    mv -f "$1/linear-mcp.json.$$" "$1/linear-mcp.json"
    LINEAR_MCP_ARGS=(--strict-mcp-config --mcp-config "$1/linear-mcp.json")
  else
    L=mcp__claude_ai_Linear
  fi
}

# linear_tools: prints why a claude run would have no Linear tools, nothing when it has them.
# AGENT_QUEUE_LINEAR_TOOLS_CMD replaces the check in specs.
linear_tools() {
  if [[ -n "${AGENT_QUEUE_LINEAR_TOOLS_CMD:-}" ]]; then eval "$AGENT_QUEUE_LINEAR_TOOLS_CMD"; return 0; fi
  local answer code header
  case "$LINEAR_MCP" in
    key)
      # The header claude will get: the helper run as claude runs it, without the key in its env
      header="$("${claude_env[@]}" sh -c "$LINEAR_HEADERS_HELPER" 2>/dev/null | jq -r '.Authorization // empty' 2>/dev/null)" || true
      [[ -n "$header" ]] || { print -r -- "key: no Linear API key for the header helper"; return 0; }
      answer="$(curl -sS -m 20 -w '\n%{http_code}' "$LINEAR_MCP_URL" \
        -H @<(print -r -- "Authorization: $header") \
        -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
        --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"agent-queue","version":"1"}}}' \
        2>/dev/null)" || true
      code="${answer##*$'\n'}"
      # A JSON-RPC error comes with a 200 too; only an initialize result counts
      if [[ "$code" != 200 ]]; then print -r -- "key: Linear's MCP answered ${code:-nothing}"
      elif [[ "$answer" != *'"result"'*'"protocolVersion"'* ]]; then print -r -- "key: Linear's MCP refused initialize"
      fi ;;
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

# Run as `zsh lib.sh header`, it is the MCP config's headersHelper
if [[ "$ZSH_EVAL_CONTEXT" == toplevel && "${1:-}" == header ]]; then
  linear_header
  exit
fi

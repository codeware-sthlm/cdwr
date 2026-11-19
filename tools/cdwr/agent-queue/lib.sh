#!/bin/zsh
# Shared by run.sh, implement.sh and wait.sh: the Linear credentials, the GraphQL call, the Linear
# MCP the claude runs use, and the attended query.
# Read-only on purpose: no gh call and no mutation belong here.

LIB_SH="${${(%):-%x}:A}"

# In the container the credential files have fixed places on the tmpfs, so a claude run finds
# them without the variables that name them: claude_env drops those, and a session cannot read a
# file through a variable the deny rules never see
if [[ "${AGENT_QUEUE_HOST:-}" == container ]]; then
  : "${AGENT_QUEUE_LINEAR_KEY_FILE:=/run/agent/linear.key}"
  : "${AGENT_QUEUE_LINEAR_APP_FILE:=/run/agent/linear-app.env}"
  : "${AGENT_QUEUE_LINEAR_TOKEN_FILE:=/run/agent/linear.token}"
fi

# The static key, kept as the fallback until it is revoked: AGENT_QUEUE_LINEAR_KEY, then the file
# AGENT_QUEUE_LINEAR_KEY_FILE names (the container's), then on macOS the Keychain
key="${AGENT_QUEUE_LINEAR_KEY:-}"
if [[ -z "$key" && -n "${AGENT_QUEUE_LINEAR_KEY_FILE:-}" && -r "$AGENT_QUEUE_LINEAR_KEY_FILE" ]]; then
  key="$(<"$AGENT_QUEUE_LINEAR_KEY_FILE")"
fi
if [[ -z "$key" && "$(uname)" == Darwin ]]; then
  key="$(security find-generic-password -s linear-agent-queue -w 2>/dev/null || true)"
fi

# The queue's own Linear app, which writes as the app user rather than as its owner. Its client
# id and secret come from the environment, then the file AGENT_QUEUE_LINEAR_APP_FILE names (the
# container's, two KEY=value lines), then on macOS the Keychain. The token they buy lasts 30 days
# and is cached in LINEAR_TOKEN_FILE, mode 600, shared by the scheduler and the helper on a host;
# it is bought again a day before it expires, or when Linear refuses it. Nothing here runs at
# source time: the specs and wait.sh source this file without a network.
LINEAR_TOKEN_URL=https://api.linear.app/oauth/token
LINEAR_TOKEN_SCOPE="read,write,comments:create,issues:create"
LINEAR_TOKEN_FILE="${AGENT_QUEUE_LINEAR_TOKEN_FILE:-${AGENT_QUEUE_HOME:-$HOME/.cdwr/agent-queue}/linear.token}"
LINEAR_TOKEN_MARGIN=86400
LINEAR_CLIENT_ID="" LINEAR_CLIENT_SECRET=""

# linear_credentials: true with the app's client id and secret in LINEAR_CLIENT_ID and _SECRET
linear_credentials() {
  [[ -n "$LINEAR_CLIENT_ID" && -n "$LINEAR_CLIENT_SECRET" ]] && return 0
  LINEAR_CLIENT_ID="${AGENT_QUEUE_LINEAR_CLIENT_ID:-}"
  LINEAR_CLIENT_SECRET="${AGENT_QUEUE_LINEAR_CLIENT_SECRET:-}"
  if [[ ( -z "$LINEAR_CLIENT_ID" || -z "$LINEAR_CLIENT_SECRET" ) &&
        -n "${AGENT_QUEUE_LINEAR_APP_FILE:-}" && -r "$AGENT_QUEUE_LINEAR_APP_FILE" ]]; then
    local line
    while IFS= read -r line; do
      case "$line" in
        AGENT_QUEUE_LINEAR_CLIENT_ID=*) LINEAR_CLIENT_ID="${line#*=}" ;;
        AGENT_QUEUE_LINEAR_CLIENT_SECRET=*) LINEAR_CLIENT_SECRET="${line#*=}" ;;
      esac
    done < "$AGENT_QUEUE_LINEAR_APP_FILE"
  fi
  if [[ ( -z "$LINEAR_CLIENT_ID" || -z "$LINEAR_CLIENT_SECRET" ) && "$(uname)" == Darwin ]]; then
    LINEAR_CLIENT_ID="$(security find-generic-password -s linear-agent-queue-client-id -w 2>/dev/null || true)"
    LINEAR_CLIENT_SECRET="$(security find-generic-password -s linear-agent-queue-client-secret -w 2>/dev/null || true)"
  fi
  [[ -n "$LINEAR_CLIENT_ID" && -n "$LINEAR_CLIENT_SECRET" ]]
}

# linear_auth: true when something can sign a Linear call: the app's credentials, or the key
linear_auth() { linear_credentials || [[ -n "$key" ]]; }

# linear_cached_token: prints the cached token while it has more than a day left
linear_cached_token() {
  [[ -r "$LINEAR_TOKEN_FILE" ]] || return 1
  jq -er --argjson now "$(date +%s)" --argjson margin "$LINEAR_TOKEN_MARGIN" \
    'select((.expiresAt | type) == "number" and .expiresAt - $now > $margin)
     | .token | select(type == "string" and length > 0)' "$LINEAR_TOKEN_FILE" 2>/dev/null
}

# linear_exchange: buys a token with the app's credentials, caches it and prints it. The secret
# reaches curl through a file, never argv. A failed exchange is remembered beside the cache for
# LINEAR_EXCHANGE_HOLD seconds, so a run with the token endpoint down pays its timeout once.
LINEAR_EXCHANGE_HOLD=600
linear_exchange() {
  linear_credentials || return 1
  local answer token expires
  # --data-urlencode reads each value from a file and encodes it, so an `&` or `%` in a secret survives
  if ! answer="$(curl -sS -m 20 "$LINEAR_TOKEN_URL" -d grant_type=client_credentials -d "scope=$LINEAR_TOKEN_SCOPE" \
        --data-urlencode client_id@<(print -rn -- "$LINEAR_CLIENT_ID") \
        --data-urlencode client_secret@<(print -rn -- "$LINEAR_CLIENT_SECRET") 2>/dev/null)" ||
     ! token="$(jq -er '.access_token | select(type == "string" and length > 0)' <<<"$answer" 2>/dev/null)"; then
    mkdir -p "${LINEAR_TOKEN_FILE:h}" 2>/dev/null || true
    ( umask 077; date +%s > "$LINEAR_TOKEN_FILE.failed" ) 2>/dev/null || true
    return 1
  fi
  rm -f "$LINEAR_TOKEN_FILE.failed" 2>/dev/null
  expires="$(jq -er '.expires_in | select(type == "number")' <<<"$answer" 2>/dev/null)" || expires=2592000
  mkdir -p "${LINEAR_TOKEN_FILE:h}" 2>/dev/null || true
  # Renamed into place: the scheduler and a session's helper may refresh at once
  if ( umask 077; jq -n --arg t "$token" --argjson e "$(( $(date +%s) + expires ))" \
        '{token: $t, expiresAt: $e}' > "$LINEAR_TOKEN_FILE.$$" ); then
    mv -f "$LINEAR_TOKEN_FILE.$$" "$LINEAR_TOKEN_FILE" 2>/dev/null || rm -f "$LINEAR_TOKEN_FILE.$$"
  fi
  print -r -- "$token"
}

# linear_exchange_held: true while a recent failed exchange says not to try again yet
linear_exchange_held() {
  local at
  [[ -r "$LINEAR_TOKEN_FILE.failed" ]] || return 1
  at="$(<"$LINEAR_TOKEN_FILE.failed")"
  [[ "$at" == <-> ]] && (( $(date +%s) - at < LINEAR_EXCHANGE_HOLD ))
}

# linear_token [force]: prints what signs a Linear call: the cached app token, else a fresh one,
# else the static key. `force` skips the cache and the hold, for a token Linear has just refused.
linear_token() {
  local t
  if [[ "${1:-}" != force ]] && t="$(linear_cached_token)"; then print -r -- "$t"; return 0; fi
  if { [[ "${1:-}" == force ]] || ! linear_exchange_held; } && t="$(linear_exchange)"; then
    print -r -- "$t"; return 0
  fi
  [[ -n "$key" ]] || return 1
  # Credentials that bought nothing are worth a line: the key stands in only until it is revoked
  if linear_credentials; then
    print -ru2 -- "linear: no app token (the exchange failed or is on hold); signing with the personal key"
  fi
  print -r -- "$key"
}

# linear_graphql <token> <query> <variables>: one GraphQL call; prints the answer. Returns 11 when
# Linear refused the token (a 401, or an AUTHENTICATION_ERROR among its errors), 1 when curl failed.
# The personal key goes bare: Linear's GraphQL refuses it behind a Bearer prefix.
linear_graphql() {
  local auth="Bearer $1" answer code body
  [[ -n "$key" && "$1" == "$key" ]] && auth="$1"
  answer="$(jq -n --arg q "$2" --argjson v "$3" '{query: $q, variables: $v}' |
    curl -sS -m 20 -w $'\n%{http_code}' https://api.linear.app/graphql \
      -H @<(print -r -- "Authorization: $auth") -H 'Content-Type: application/json' --data @-)" || return 1
  code="${answer##*$'\n'}"
  body="${answer%$'\n'*}"
  print -r -- "$body"
  if [[ "$code" == 401 ]] ||
     jq -e '(.errors // []) | any(.extensions.code? == "AUTHENTICATION_ERROR")' <<<"$body" >/dev/null 2>&1; then
    return 11
  fi
  return 0
}

# linear <query> [variables as JSON]: the GraphQL call, signed with linear_token; a refused token
# is bought again once and the call made again. Fails only when curl does. Written so a caller
# under errexit survives the refusal: the status is taken on the assignment itself.
linear() {
  local vars="${2:-}" token body rc=0; [[ -z "$vars" ]] && vars='{}'
  token="$(linear_token)" || return 1
  body="$(linear_graphql "$token" "$1" "$vars")" || rc=$?
  if (( rc == 11 )) && token="$(linear_token force)"; then
    rc=0
    body="$(linear_graphql "$token" "$1" "$vars")" || rc=$?
  fi
  (( rc == 1 )) && return 1
  print -r -- "$body"
}

# The Linear MCP the claude runs get. key, the default on every host: Linear's own server signed
# by linear_token, so the runs write as the app. connector: the claude.ai connector of an
# interactive login, which writes as its owner; an explicit opt-out. No credential reaches argv,
# the config or claude's environment: claude runs under `claude_env`, and the config's
# headersHelper asks lib.sh for the header, which finds the token in the cache, the files or the
# Keychain.
LINEAR_MCP="${AGENT_QUEUE_LINEAR_MCP:-key}"
LINEAR_MCP_URL=https://mcp.linear.app/mcp

# claude_env: the env prefix for every claude run, without the credentials; the session's wait.sh
# finds them the same way the helper does
claude_env=(env -u AGENT_QUEUE_LINEAR_KEY -u AGENT_QUEUE_LINEAR_CLIENT_ID -u AGENT_QUEUE_LINEAR_CLIENT_SECRET
  -u AGENT_QUEUE_LINEAR_KEY_FILE -u AGENT_QUEUE_LINEAR_APP_FILE -u AGENT_QUEUE_LINEAR_TOKEN_FILE)

# linear_header [force]: the MCP header as JSON, for the headersHelper and the container's proxy;
# nothing without a token. force buys a new token, after Linear refused the cached one.
linear_header() {
  local t
  t="$(linear_token "${1:-}")" || return 1
  jq -nc --arg k "Bearer $t" '{Authorization: $k}'
}

# The helper command, as claude's shell runs it: this file, run rather than sourced
LINEAR_HEADERS_HELPER="zsh ${(q)LIB_SH} header"
# The container's Linear proxy (apps/agent-host/linear-mcp-proxy.mjs), which the entrypoint starts
# on this port; elsewhere there is none and claude signs through the helper
LINEAR_PROXY_URL="${AGENT_QUEUE_LINEAR_PROXY_PORT:+http://127.0.0.1:$AGENT_QUEUE_LINEAR_PROXY_PORT/mcp}"
# The proxy's second route: the attended query, run as the queue's own user, for a session
# that holds no Linear credentials
LINEAR_PROXY_ATTENDED="${AGENT_QUEUE_LINEAR_PROXY_PORT:+http://127.0.0.1:$AGENT_QUEUE_LINEAR_PROXY_PORT/attended}"

# linear_mcp <dir>: sets L, the tool prefix the allowlists use, and LINEAR_MCP_ARGS, the claude
# flags that load the server; key mode writes its config into <dir>.
linear_mcp() {
  LINEAR_MCP_ARGS=()
  if [[ "$LINEAR_MCP" == key ]]; then
    L=mcp__agent_linear
    # Renamed into place: the scheduler and a launched session may write it at once. In the
    # container the proxy signs, so claude gets no helper and the session no way to the token.
    if [[ -n "$LINEAR_PROXY_URL" ]]; then
      jq -n --arg url "$LINEAR_PROXY_URL" \
        '{mcpServers: {agent_linear: {type: "http", url: $url}}}' > "$1/linear-mcp.json.$$"
    else
      jq -n --arg url "$LINEAR_MCP_URL" --arg helper "$LINEAR_HEADERS_HELPER" \
        '{mcpServers: {agent_linear: {type: "http", url: $url, headersHelper: $helper}}}' > "$1/linear-mcp.json.$$"
    fi
    mv -f "$1/linear-mcp.json.$$" "$1/linear-mcp.json"
    LINEAR_MCP_ARGS=(--strict-mcp-config --mcp-config "$1/linear-mcp.json")
  else
    L=mcp__claude_ai_Linear
  fi
}

# linear_allowed: the Linear tools a claude run may call (linear-tools.txt beside this file), one
# per line without the prefix; fails when the list is missing or empty
linear_allowed() {
  local line out=()
  [[ -r "${LIB_SH:h}/linear-tools.txt" ]] || return 1
  for line in "${(@f)$(<"${LIB_SH:h}/linear-tools.txt")}"; do
    line="${${line%%\#*}//[[:space:]]/}"
    [[ -n "$line" ]] && out+=("$line")
  done
  (( ${#out} )) || return 1
  print -rl -- "${out[@]}"
}

# linear_tools: prints why a claude run would have no Linear tools, nothing when it has them.
# AGENT_QUEUE_LINEAR_TOOLS_CMD replaces the check in specs.
linear_tools() {
  if [[ -n "${AGENT_QUEUE_LINEAR_TOOLS_CMD:-}" ]]; then eval "$AGENT_QUEUE_LINEAR_TOOLS_CMD"; return 0; fi
  local answer code header attempt
  case "$LINEAR_MCP" in
    key)
      # Through the proxy, unsigned: it signs and forwards, and buys a new token on a 401 itself,
      # so a pass means it is up and Linear takes its token
      if [[ -n "$LINEAR_PROXY_URL" ]]; then
        answer="$(curl -sS -m 30 -w '\n%{http_code}' "$LINEAR_PROXY_URL" \
          -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
          --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"agent-queue","version":"1"}}}' \
          2>/dev/null)" || true
        code="${answer##*$'\n'}"
        [[ "$code" == <100-599> ]] || code=
        if [[ -z "$code" ]]; then print -r -- "key: the Linear proxy on 127.0.0.1:$AGENT_QUEUE_LINEAR_PROXY_PORT answered nothing"
        elif [[ "$code" != 200 ]]; then print -r -- "key: the Linear proxy on 127.0.0.1:$AGENT_QUEUE_LINEAR_PROXY_PORT answered $code"
        elif [[ "$answer" != *'"result"'*'"protocolVersion"'* ]]; then print -r -- "key: Linear's MCP refused initialize"
        fi
        return 0
      fi
      # Twice at most: a 401 buys a new token first, so a revoked one never blocks a launch
      for attempt in 1 2; do
        # The header claude will get: the helper run as claude runs it, without credentials in its env
        header="$("${claude_env[@]}" sh -c "$LINEAR_HEADERS_HELPER" 2>/dev/null | jq -r '.Authorization // empty' 2>/dev/null)" || true
        [[ -n "$header" ]] || { print -r -- "key: no Linear credentials for the header helper"; return 0; }
        answer="$(curl -sS -m 20 -w '\n%{http_code}' "$LINEAR_MCP_URL" \
          -H @<(print -r -- "Authorization: $header") \
          -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
          --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"agent-queue","version":"1"}}}' \
          2>/dev/null)" || true
        code="${answer##*$'\n'}"
        if [[ "$code" == 401 && "$attempt" == 1 ]] && linear_token force >/dev/null 2>&1; then continue; fi
        break
      done
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
  }) { ...queued }
  # Merged tickets whose agent label was cleared: a later comment still gets its answer
  merged: issues(first: 100, filter: {
    team: { key: { eq: "COD" } }
    state: { type: { eq: "completed" } }
    completedAt: { gt: "-P14D" }
    comments: { some: { body: { startsWith: "**Agent: PR ready**" } } }
  }) { ...queued }
  # Canceled tickets still carrying an agent label, for the audit (watch.jq `audit`)
  canceled: issues(first: 100, filter: {
    team: { key: { eq: "COD" } }
    labels: { some: { name: { startsWith: "agent:" } } }
    state: { type: { eq: "canceled" } }
    updatedAt: { gt: "-P14D" }
  }) { ...queued }
  # Only what watch.jq `to_label` and `asks_first` read: the description, but no comments
  subissues: issues(first: 100, filter: {
    team: { key: { eq: "COD" } }
    parent: { null: false }
    state: { type: { nin: ["completed", "canceled"] } }
  }) {
    nodes {
      identifier title priority createdAt description
      parent { identifier title state { type } }
      state { type }
      labels(first: 20) { nodes { name } }
      inverseRelations(first: 20) {
        nodes { type issue { identifier completedAt state { type } labels(first: 20) { nodes { name } } } }
        pageInfo { hasNextPage }
      }
    }
  }
}
fragment queued on IssueConnection {
  nodes {
    identifier title priority createdAt completedAt updatedAt description
    parent {
      identifier title state { type }
      children(first: 25) { pageInfo { hasNextPage } nodes { identifier title state { type } labels(first: 5) { nodes { name } } } }
    }
    children(first: 25) { pageInfo { hasNextPage } nodes { identifier title state { type } labels(first: 5) { nodes { name } } } }
    state { type }
    labels { nodes { name } }
    # The author tells the agent's comments from Håkan's (watch.jq `is_agent`)
    comments(first: 50, orderBy: createdAt) { nodes { body createdAt user { id app } } }
    # Who added agent:ready (watch.jq `ready_by_app`)
    history(first: 50) { nodes { createdAt actor { id app } addedLabels { name } } }
    inverseRelations { nodes { type issue { identifier completedAt state { type } labels(first: 20) { nodes { name } } } } }
  }
}
GQL

# linear_via_proxy <query>: the attended query through the container's proxy, for a session
# without credentials of its own. The route runs that one query and nothing else, so any other
# query is refused here rather than answered wrongly. The answer comes as the GraphQL body.
linear_via_proxy() {
  local answer code body
  if [[ "$1" != "$ATTENDED_QUERY" ]]; then
    print -ru2 -- "linear: only the attended query goes through the proxy"; return 1
  fi
  if [[ -z "$LINEAR_PROXY_ATTENDED" ]]; then
    print -ru2 -- "linear: no proxy port (AGENT_QUEUE_LINEAR_PROXY_PORT) to ask for the attended query"
    return 1
  fi
  # Past the proxy's own deadline, so what arrives is its answer and never a client timeout
  answer="$(curl -sS -m 150 -w $'\n%{http_code}' -X POST -H 'Content-Length: 0' "$LINEAR_PROXY_ATTENDED")" || return 1
  code="${answer##*$'\n'}"
  body="${answer%$'\n'*}"
  if [[ "$code" != 200 ]]; then
    print -ru2 -- "linear: the proxy answered $code for the attended query: ${body:0:200}"; return 1
  fi
  print -r -- "$body"
}

# attended_nodes: appends the merged and canceled tickets and the open sub-issues not already there to
# .data.issues.nodes, keeping Linear's order, so every reader of the attended response sees one list. A filter-level `or` would be one field, but Linear widens a
# nested `or` to the whole team.
attended_nodes() {
  # An error answer stays as it came, so it still reads as one
  jq -c 'if (.data.issues.nodes | type) == "array" then
      reduce ((.data.merged.nodes // [])[], (.data.canceled.nodes // [])[], (.data.subissues.nodes // [])[]) as $n (.;
        if any(.data.issues.nodes[]; .identifier == $n.identifier) then . else .data.issues.nodes += [$n] end)
      | del(.data.merged, .data.canceled, .data.subissues)
    else . end' 2>/dev/null
}

# Every open COD ticket and the ones Done within 14 days, for the tree and the audit's candidate
# rules (watch.jq `tree`, `candidate_gaps`). Only the run reads it; the pick never does.
read -r -d '' TREE_QUERY <<'GQL' || true
query($after: String) {
  issues(first: 50, after: $after, filter: {
    team: { key: { eq: "COD" } }
    state: { type: { neq: "canceled" } }
    or: [{ completedAt: { null: true } }, { completedAt: { gt: "-P14D" } }]
  }) {
    pageInfo { hasNextPage endCursor }
    nodes {
      identifier title priority createdAt completedAt updatedAt description
      parent {
        identifier title updatedAt state { type }
        children(first: 25) { pageInfo { hasNextPage } nodes { identifier title state { type } labels(first: 5) { nodes { name } } } }
      }
      children(first: 25) { pageInfo { hasNextPage } nodes { identifier title state { type } labels(first: 5) { nodes { name } } } }
      state { type }
      labels(first: 20) { nodes { name } }
      comments(first: 25, orderBy: createdAt) { nodes { body createdAt user { id app } } }
      inverseRelations(first: 20) {
        nodes { type issue { identifier completedAt state { type } labels(first: 20) { nodes { name } } } }
        pageInfo { hasNextPage }
      }
    }
  }
}
GQL

# tree_nodes: reads the TREE_QUERY pages (up to 4 of 50) and prints { nodes, truncated }, truncated
# when tickets are left past the last page. Fails when Linear answers an error.
tree_nodes() {
  local resp after=null page pages="${TMPDIR:-/tmp}/tree-pages.$$" truncated=false
  : > "$pages"
  for page in {1..4}; do
    resp="$(linear "$TREE_QUERY" "$(jq -nc --argjson a "$after" '{after: $a}')")" || { rm -f "$pages"; return 1; }
    jq -e '.data.issues.nodes' >/dev/null <<<"$resp" 2>/dev/null || { rm -f "$pages"; return 1; }
    jq -c '.data.issues.nodes' <<<"$resp" >> "$pages"
    [[ "$(jq -r '.data.issues.pageInfo.hasNextPage' <<<"$resp")" == true ]] || break
    after="$(jq -c '.data.issues.pageInfo.endCursor' <<<"$resp")"
    (( page == 4 )) && truncated=true
  done
  jq -cs --argjson t "$truncated" '{ nodes: add, truncated: $t }' "$pages"
  rm -f "$pages"
}

# queue_limit <dir>: the limit the desk sets in <dir>/limit, a whole number 1-20; 5 otherwise
queue_limit() {
  local v
  v="$(tr -d '[:space:]' 2>/dev/null < "$1/limit" || true)"
  if [[ "$v" == <-> ]] && (( 10#$v >= 1 && 10#$v <= 20 )); then print -r -- "$(( 10#$v ))"; else print -r -- 5; fi
}

# --- The plan's session limit (COD-801) ---
# A claude run that ends with `"api_error": "usage_limit_reached"` never worked. run.sh and
# implement.sh record it as `limited` and write limited-until.json in the queue home; until that
# time no claude run starts. One file, so the two scripts can't disagree.
limit_file() { print -r -- "${HOME_DIR:-${AGENT_QUEUE_HOME:-$HOME/.cdwr/agent-queue}}/limited-until.json"; }

# limit_until <text> [now]: the epoch the limit lifts, from `resets 7:10am (UTC)` or
# `resets 1pm (Europe/Stockholm)` in the result text, as the next time that clock time comes round
# in that zone (at most a day away). Text it can't read (a weekday, an unknown zone) holds an hour.
limit_until() {
  setopt local_options no_bash_rematch
  local text="$1" now="${2:-$(date +%s)}" h m pm=0 zone target sod until diff
  if [[ "$text" =~ 'resets ([0-9]{1,2})(:([0-9]{2}))?(am|pm) \(([A-Za-z_+/-]+)\)' ]]; then
    h=$(( 10#$match[1] )) m=$(( 10#${match[3]:-0} )) zone="$match[5]"
    [[ "$match[4]" == pm ]] && pm=12
    if (( h >= 1 && h <= 12 && m < 60 )) && [[ "$zone" != *..* ]] &&
       [[ "$zone" == UTC || -r "/usr/share/zoneinfo/$zone" ]] && sod="$(zone_sod "$zone" "$now")"; then
      target=$(( (h % 12 + pm) * 3600 + m * 60 ))
      until=$(( now + target - sod ))
      (( until > now )) || (( until += 86400 ))
      # A DST change between now and the reset shifts the wall clock by its offset: correct for it,
      # across midnight too (12am)
      if sod="$(zone_sod "$zone" "$until")"; then
        diff=$(( target - sod ))
        (( diff > 43200 )) && (( diff -= 86400 ))
        (( diff < -43200 )) && (( diff += 86400 ))
        (( diff != 0 && diff <= 7200 && diff >= -7200 )) && (( until += diff ))
      fi
      print -r -- $until
      return 0
    fi
  fi
  print -r -- $(( now + 3600 ))
}

# zone_sod <zone> <epoch>: the seconds since local midnight in that zone
zone_sod() {
  local hms
  hms="$(TZ="$1" date -d "@$2" '+%H %M %S' 2>/dev/null || TZ="$1" date -r "$2" '+%H %M %S' 2>/dev/null)" &&
    [[ "$hms" == <->' '<->' '<-> ]] || return 1
  print -r -- $(( 10#${hms[1,2]} * 3600 + 10#${hms[4,5]} * 60 + 10#${hms[7,8]} ))
}

# limit_held: succeeds while a hold is in force, printing when it lifts (`07:10 UTC`)
limit_held() {
  local until
  until="$(jq -r '.until // empty' "$(limit_file)" 2>/dev/null)"
  [[ "$until" == <-> ]] && (( until > $(date +%s) )) || return 1
  print -r -- "$(TZ=UTC date -d "@$until" +%H:%M 2>/dev/null || TZ=UTC date -r "$until" +%H:%M) UTC"
}

# limit_hold <result json>: succeeds when the run ended on the session limit, and writes the hold.
# LIMIT_TEXT is the limit's own text; LIMIT_NEW is true when no hold was in force before, so the
# caller sends one notice per hold. A hold it can't write fails, so the run counts as failed: a
# limited launch is given back every time, and without a hold it would relaunch every tick.
LIMIT_TEXT="" LIMIT_NEW=false
limit_hold() {
  local file
  [[ "$(jq -r '.api_error // empty' "$1" 2>/dev/null)" == usage_limit_reached ]] || return 1
  file="$(limit_file)"
  LIMIT_TEXT="$(jq -r '.result // empty' "$1" 2>/dev/null)"
  [[ -n "$LIMIT_TEXT" ]] || LIMIT_TEXT="session limit reached"
  if limit_held >/dev/null; then LIMIT_NEW=false; else LIMIT_NEW=true; fi
  jq -nc --argjson u "$(limit_until "$LIMIT_TEXT")" --arg t "$LIMIT_TEXT" --arg a "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{until: $u, text: $t, at: $a}' > "$file.tmp.$$" 2>/dev/null && mv "$file.tmp.$$" "$file" 2>/dev/null &&
    return 0
  rm -f "$file.tmp.$$" 2>/dev/null
  return 1
}

# host_id: the machine's stable name (a Mac's hostname follows the network); session-hook.sh has the twin
host_id() { [[ "$(uname)" == Darwin ]] && scutil --get LocalHostName 2>/dev/null || hostname -s; }

# Succeeds when this machine runs the scheduler: the container, or a Mac with the launchd job. It
# mirrors `schedulerHere` in agent.logic.ts; a plist that is not loaded still counts, so a broken
# install stays reported.
scheduler_here() {
  [[ "${AGENT_QUEUE_HOST:-}" == container ]] && return 0
  [[ -e "$HOME/Library/LaunchAgents/se.codeware.agent-queue.plist" ]] && return 0
  command -v launchctl >/dev/null 2>&1 &&
    launchctl print "gui/$(id -u)/se.codeware.agent-queue" >/dev/null 2>&1 && return 0
  return 1
}

# For the Mac's attended side when the scheduler runs elsewhere: prints {host, at, watch, renovate}
# for the freshest queue_state row of another host that carries a watch, or nothing. A Mac row from
# before an uninstall has no watch, so it never wins. Needs supabase_select (telemetry.sh), sourced
# by the caller; without it, or on any failure, it prints nothing. Always succeeds.
remote_watch() {
  (( $+functions[supabase_select] )) || return 0
  local filter="watch=not.is.null&host=neq.$(jq -rn --arg h "$(host_id)" '$h | @uri')&order=at.desc&limit=1" cols out
  # Without the renovate column (its migration not applied yet) the select fails: read the rest
  for cols in host,at,watch,renovate host,at,watch; do
    out="$(supabase_select queue_state "select=$cols&$filter" |
      jq -c '.[0] | select(. != null and (.watch | type == "object"))
        | {host, at, watch} + (if .renovate != null then {renovate} else {} end)' 2>/dev/null)"
    [[ -n "$out" ]] && { print -r -- "$out"; return 0; }
  done
  return 0
}

# AGENT_QUEUE_WATCH_CMD replaces the remote read with a command that prints the same object
if [[ -n "${AGENT_QUEUE_WATCH_CMD:-}" ]]; then
  remote_watch() { eval "$AGENT_QUEUE_WATCH_CMD"; }
fi

# watch_state <watch.json>: sets WATCH_STATE to the watch state as compact JSON, and WATCH_SOURCE
# to where it came from. The file where the scheduler runs (`local`); elsewhere the freshest other
# host's, from remote_watch (`<host> · <at>`); unreadable, the file as before (`local, remote
# unreadable`). RENOVATE_STATE is the Renovate state from the same place: renovate.json beside the
# watch file, or the row's renovate. Globals, not output: a `$(watch_state)` call would keep the
# source in a subshell
WATCH_SOURCE=""
WATCH_STATE="{}"
RENOVATE_STATE="{}"
watch_state() {
  local remote
  if scheduler_here; then
    WATCH_SOURCE=local
  elif remote="$(remote_watch)" && [[ -n "$remote" ]] &&
       jq -e '.watch | type == "object"' >/dev/null <<<"$remote" 2>/dev/null; then
    WATCH_SOURCE="$(jq -r '"\(.host) · \(.at)"' <<<"$remote")"
    WATCH_STATE="$(jq -c '.watch' <<<"$remote")"
    RENOVATE_STATE="$(jq -c '.renovate | if type == "object" then . else {} end' <<<"$remote" 2>/dev/null || print '{}')"
    return 0
  else
    WATCH_SOURCE="local, remote unreadable"
  fi
  WATCH_STATE="$(jq -c 'if type == "object" then . else {} end' "$1" 2>/dev/null || print '{}')"
  RENOVATE_STATE="$(jq -c 'if type == "object" then . else {} end' "${1:h}/renovate.json" 2>/dev/null || print '{}')"
  # An empty file reads as nothing with success, and `--argjson` refuses an empty value
  [[ -n "$WATCH_STATE" ]] || WATCH_STATE='{}'
  [[ -n "$RENOVATE_STATE" ]] || RENOVATE_STATE='{}'
  return 0
}

# Run as `zsh lib.sh header`, it is the MCP config's headersHelper; the container's proxy runs it
# too, and with `force` after a 401
# Run rather than sourced: `header` prints the MCP header, `attended` answers the attended
# query. The proxy runs both as the queue's own user, so a session never holds the token.
if [[ "$ZSH_EVAL_CONTEXT" == toplevel ]]; then
  case "${1:-}" in
    header) linear_header "${2:-}"; exit ;;
    attended) linear "$ATTENDED_QUERY"; exit ;;
  esac
fi

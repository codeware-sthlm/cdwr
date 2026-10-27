#!/bin/zsh
# Telemetry rows for the agent queue's Supabase project. Sourced; unconfigured or failing, it never fails the caller.
#   supabase_insert <table> <json>                           POST a row, or an array of rows
#   supabase_upsert <table> <on_conflict> <json> [merge|ignore]   same, resolving duplicates on the given columns (default merge)
# Needs AGENT_SUPABASE_URL and AGENT_SUPABASE_SERVICE_KEY; without both it does nothing.
# The key travels on curl's stdin, never in its arguments, and is never printed.

_supabase_post() {
  local url=$1 prefer=$2 body=$3 msg
  if ! msg="$(printf 'header = "apikey: %s"\nheader = "Authorization: Bearer %s"\n' \
      "$AGENT_SUPABASE_SERVICE_KEY" "$AGENT_SUPABASE_SERVICE_KEY" |
    curl --max-time 10 -sS -f -K - -X POST \
      -H 'Content-Type: application/json' -H "Prefer: $prefer" \
      -d "$body" "$url" 2>&1 >/dev/null)"; then
    msg="warn: supabase ${url##*/rest/v1/} failed: ${msg//$'\n'/ }"
    msg="${msg//$AGENT_SUPABASE_SERVICE_KEY/***}"
    if (( $+functions[note] )); then note "$msg"; else print -ru2 -- "$msg"; fi
  fi
  return 0
}

supabase_insert() {
  [[ -n "${AGENT_SUPABASE_URL:-}" && -n "${AGENT_SUPABASE_SERVICE_KEY:-}" ]] || return 0
  _supabase_post "${AGENT_SUPABASE_URL%/}/rest/v1/$1" 'return=minimal' "$2"
}

supabase_upsert() {
  [[ -n "${AGENT_SUPABASE_URL:-}" && -n "${AGENT_SUPABASE_SERVICE_KEY:-}" ]] || return 0
  local resolution=merge-duplicates
  [[ "${4:-merge}" == ignore ]] && resolution=ignore-duplicates
  _supabase_post "${AGENT_SUPABASE_URL%/}/rest/v1/$1?on_conflict=$2" "resolution=$resolution,return=minimal" "$3"
}

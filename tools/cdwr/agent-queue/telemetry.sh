#!/bin/zsh
# Telemetry rows for the agent queue's Supabase project. Sourced; unconfigured or failing, it never fails the caller.
#   supabase_insert <table> <json>                           POST a row, or an array of rows
#   supabase_upsert <table> <on_conflict> <json> [merge|ignore]   same, resolving duplicates on the given columns (default merge)
#   telemetry_env <env file>                                 fills in the two variables from a plain KEY=VALUE file when unset
#   telemetry_on                                             succeeds when both are set
#   telemetry_run <started_at> <outcome> <ticket> <detail> <attended> <kind> <interval> <limit> <version>
#                                                            one row in `runs`; empty fields become null
#   telemetry_queue_state <last_run> <attended> <suggested> <job> <view json>
#                                                            upserts this host's row in `queue_state`; empty fields become null,
#                                                            a view that isn't JSON too
#   telemetry_session <id> <kind>                            upserts the session's heartbeat in `sessions`
#   supabase_delete <table> <query>                          DELETE the rows a PostgREST filter matches
#   telemetry_host_metrics                                   Linux only: one row of load, memory and disk in `host_metrics`,
#                                                            then this host's rows older than 7 days are deleted; roots
#                                                            overridable with HOST_METRICS_OS, _PROC, _SYS and _DISK
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

_supabase_delete() {
  local url=$1 msg
  if ! msg="$(printf 'header = "apikey: %s"\nheader = "Authorization: Bearer %s"\n' \
      "$AGENT_SUPABASE_SERVICE_KEY" "$AGENT_SUPABASE_SERVICE_KEY" |
    curl --max-time 10 -sS -f -K - -X DELETE -H 'Prefer: return=minimal' "$url" 2>&1 >/dev/null)"; then
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

supabase_delete() {
  [[ -n "${AGENT_SUPABASE_URL:-}" && -n "${AGENT_SUPABASE_SERVICE_KEY:-}" ]] || return 0
  _supabase_delete "${AGENT_SUPABASE_URL%/}/rest/v1/$1?$2"
}

telemetry_on() { [[ -n "${AGENT_SUPABASE_URL:-}" && -n "${AGENT_SUPABASE_SERVICE_KEY:-}" ]]; }

# The two variables read as text, never sourced; whatever is already set wins. The key stays a
# shell variable and is never exported (an exported one is unexported here), so no child inherits
# it: a command that needs it names it on its own line.
telemetry_env() {
  local file=$1 line key value
  if ! telemetry_on && [[ -r "$file" ]]; then
    for line in "${(@f)$(<"$file")}"; do
      [[ "$line" == AGENT_SUPABASE_(URL|SERVICE_KEY)=* ]] || continue
      key="${line%%=*}"; value="${line#*=}"
      value="${${value#[\"\']}%[\"\']}"
      [[ -n "${(P)key:-}" ]] || typeset -g "$key=$value"
    done
  fi
  [[ -z "${AGENT_SUPABASE_SERVICE_KEY+x}" ]] || typeset +x AGENT_SUPABASE_SERVICE_KEY
  return 0
}

# The machine's stable name; run.sh has the same in lib.sh as host_id
telemetry_host() { [[ "$(uname)" == Darwin ]] && scutil --get LocalHostName 2>/dev/null || hostname -s; }

telemetry_run() {
  telemetry_on || return 0
  local body
  body="$(jq -nc --arg started "$1" --arg outcome "$2" --arg ticket "$3" --arg detail "$4" \
    --arg attended "$5" --arg kind "$6" --arg interval "$7" --arg limit "$8" --arg version "$9" \
    --arg host "$(telemetry_host)" --arg finished "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
    def orNull: if . == "" then null else . end;
    {started_at: $started, finished_at: $finished, outcome: $outcome, ticket: ($ticket | orNull),
     detail: ($detail | orNull), host: $host,
     attended: (if $attended == "true" then true elif $attended == "false" then false else null end),
     job: {kind: $kind, interval: ($interval | tonumber? // null), limit: ($limit | tonumber? // null),
           version: ($version | orNull)}}')" || return 0
  supabase_insert runs "$body"
}

telemetry_queue_state() {
  telemetry_on || return 0
  local body
  body="$(jq -nc --arg last_run "$1" --arg attended "$2" --arg suggested "$3" --arg job "$4" --arg view "$5" \
    --arg host "$(telemetry_host)" --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
    def orNull: if . == "" then null else . end;
    {host: $host, at: $now, last_run: ($last_run | orNull), attended: ($attended | orNull),
     suggested: ($suggested | orNull), job: ($job | orNull), view: ($view | try fromjson catch null)}')" || return 0
  supabase_upsert queue_state host "$body" merge
}

telemetry_session() {
  telemetry_on || return 0
  local body
  body="$(jq -nc --arg id "$1" --arg kind "$2" --arg host "$(telemetry_host)" \
    --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{id: $id, host: $host, kind: $kind, last_seen: $now}')" || return 0
  supabase_upsert sessions id "$body" merge
}

telemetry_host_metrics() {
  telemetry_on || return 0
  [[ "${HOST_METRICS_OS:-$(uname)}" == Linux ]] || return 0
  local proc="${HOST_METRICS_PROC:-/proc}" sys="${HOST_METRICS_SYS:-/sys}" disk="${HOST_METRICS_DISK:-/work}"
  [[ -d "$disk" ]] || disk=/
  local -a load df_out
  local cores body host cutoff mem_total mem_available swap_total swap_free cg_current cg_max
  [[ -r "$proc/loadavg" ]] || return 0
  load=(${(s: :)$(<"$proc/loadavg")})
  # Host-wide like /proc/loadavg; nproc follows the container's cpuset
  cores=
  [[ -r "$proc/cpuinfo" ]] && cores="$(grep -c '^processor' "$proc/cpuinfo" 2>/dev/null)"
  [[ "$cores" == <-> && "$cores" != 0 ]] || cores="$(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null)" || return 0
  # /proc/meminfo is in kB
  mem_total="$(awk '$1 == "MemTotal:" {printf "%.0f", $2 * 1024}' "$proc/meminfo" 2>/dev/null)"
  mem_available="$(awk '$1 == "MemAvailable:" {printf "%.0f", $2 * 1024}' "$proc/meminfo" 2>/dev/null)"
  swap_total="$(awk '$1 == "SwapTotal:" {printf "%.0f", $2 * 1024}' "$proc/meminfo" 2>/dev/null)"
  swap_free="$(awk '$1 == "SwapFree:" {printf "%.0f", $2 * 1024}' "$proc/meminfo" 2>/dev/null)"
  # Used + Available, so reserved blocks are left out and the used share matches df's Use%
  df_out=(${(s: :)$(df -Pk "$disk" 2>/dev/null | awk 'NR == 2 {printf "%.0f %.0f", ($3 + $4) * 1024, $4 * 1024}')})
  # Absent files and `max` are not numbers, so they turn into null
  cg_current= cg_max=
  [[ -r "$sys/fs/cgroup/memory.current" ]] && cg_current="$(<"$sys/fs/cgroup/memory.current")"
  [[ -r "$sys/fs/cgroup/memory.max" ]] && cg_max="$(<"$sys/fs/cgroup/memory.max")"
  host="$(telemetry_host)"
  body="$(jq -nc --arg host "$host" --arg cores "$cores" --arg l1 "${load[1]:-}" --arg l5 "${load[2]:-}" \
    --arg l15 "${load[3]:-}" --arg mt "$mem_total" --arg ma "$mem_available" --arg st "$swap_total" \
    --arg sf "$swap_free" --arg dt "${df_out[1]:-}" --arg df "${df_out[2]:-}" \
    --arg cc "$cg_current" --arg cm "$cg_max" '
    def num: tonumber? // null;
    {host: $host, cores: ($cores | num), load1: ($l1 | num), load5: ($l5 | num), load15: ($l15 | num),
     mem_total: ($mt | num), mem_available: ($ma | num), swap_total: ($st | num), swap_free: ($sf | num),
     disk_total: ($dt | num), disk_free: ($df | num), cgroup_mem_current: ($cc | num), cgroup_mem_max: ($cm | num)}
    | if [.cores, .load1, .load5, .load15, .mem_total, .mem_available, .swap_total, .swap_free, .disk_total, .disk_free]
        | any(. == null) then empty else . end')" || return 0
  [[ -n "$body" ]] || return 0
  supabase_insert host_metrics "$body"
  cutoff="$(jq -nr 'now - 7 * 86400 | todate')" || return 0
  supabase_delete host_metrics "host=eq.$(jq -nr --arg h "$host" '$h | @uri')&at=lt.$cutoff"
  return 0
}

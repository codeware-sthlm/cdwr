#!/bin/zsh
# Sentry cron monitor check-ins for run.sh. Sourced; a failed or unconfigured check-in never fails a run.
#   checkin_url              the monitor's HTTP check-in URL from SENTRY_DSN; empty when unset or malformed
#   checkin <status> [id]    in_progress prints a new check-in id; ok and error send with the given id
# Every check-in carries the monitor config (upsert), so whichever arrives first creates the monitor
# `agent-queue`: a paused queue's lone ok, or an ok processed before its in_progress.
# https://docs.sentry.io/product/crons/getting-started/http/

CHECKIN_SLUG=agent-queue

# https://<public_key>@<host>/<project_id> becomes https://<host>/api/<project_id>/cron/<slug>/<public_key>/
checkin_url() {
  local dsn="${SENTRY_DSN:-}"
  if [[ "$dsn" =~ '^(https?)://([^@/:]+)@([^/@]+)/([0-9]+)$' ]]; then
    print -r -- "${match[1]}://${match[3]}/api/${match[4]}/cron/$CHECKIN_SLUG/${match[2]}/"
  fi
}

checkin_uuid() {
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen | tr '[:upper:]' '[:lower:]'
  else
    tr -d '[:space:]' < /proc/sys/kernel/random/uuid
  fi
}

checkin() {
  local state=$1 id="${2:-}" url body msg
  url="$(checkin_url)"
  [[ -n "$url" ]] || return 0
  if [[ "$state" == in_progress ]]; then
    id="$(checkin_uuid)" || id=""
    print -r -- "$id"
  fi
  body="$(jq -cn --arg s "$state" --arg id "$id" '{
    status: $s,
    monitor_config: {
      schedule: {type: "interval", value: 10, unit: "minute"},
      checkin_margin: 15, max_runtime: 60, timezone: "UTC"
    }
  } + (if $id == "" then {} else {check_in_id: $id} end)')" || return 0
  if ! msg="$(curl --max-time 5 -fsS -X POST -H 'Content-Type: application/json' -d "$body" "$url" 2>&1 >/dev/null)"; then
    msg="warn: sentry check-in $state failed: ${msg//$'\n'/ }"
    if (( $+functions[note] )); then note "$msg"; else print -ru2 -- "$msg"; fi
  fi
  return 0
}

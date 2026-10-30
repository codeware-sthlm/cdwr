#!/bin/zsh
# Claude Code status line (`cdwr agent statusline install` sets it in ~/.claude/settings.json).
# Prints one line: model · directory · 5h and 7d plan usage when Claude Code sends them.
# The plan's `rate_limits` go to <queue home>/rate-limits.json on every call, and to the telemetry
# table `plan_usage` when a value changed, at most once a minute and detached, so the status line
# never waits on the network. Prints nothing else and always exits 0.
exec 2>/dev/null

zmodload zsh/stat 2>/dev/null
HERE="${0:A:h}"
STATE="${AGENT_QUEUE_HOME:-${CDWR_HOME:-$HOME/.cdwr}/agent-queue}"

# send <limits json>: one row per window in `plan_usage`, then rows older than 14 days go
send() {
  local limits=$1 rows cutoff env_file common main_env=""
  source "$HERE/telemetry.sh" || return 0
  # The file named in the environment, else this checkout's, else the main checkout's,
  # which is where a linked worktree finds the credentials
  common="$(git -C "$HERE" rev-parse --path-format=absolute --git-common-dir)" &&
    main_env="${common:h}/tools/cdwr/.env"
  for env_file in "${AGENT_QUEUE_ENV_FILE:-}" "$HERE/../.env" "$main_env"; do
    [[ -n "$env_file" ]] && telemetry_env "$env_file"
    telemetry_on && break
  done
  telemetry_on || return 0
  rows="$(jq -c --arg host "$(telemetry_host)" '
    to_entries | map({kind: .key, resets_at: (.value.resets_at | todate),
      used_percentage: .value.used_percentage, host: $host})' <<<"$limits")" || return 0
  # The same value from another host is already there: keep the first sample
  supabase_upsert plan_usage kind,resets_at,used_percentage "$rows" ignore
  cutoff="$(jq -nr 'now - 14 * 86400 | todate')" || return 0
  supabase_delete plan_usage "sampled_at=lt.$cutoff"
}

# record <limits json>: the file on every call, a row when the value changed
record() {
  local limits=$1 file="$STATE/rate-limits.json" sent="$STATE/rate-limits.sent" last
  mkdir -p "$STATE" || return 0
  jq -nc --argjson limits "$limits" '{at: (now | floor | todate), rate_limits: $limits}' > "$file.tmp.$$" &&
    mv -f "$file.tmp.$$" "$file" || rm -f "$file.tmp.$$"
  [[ "$(<"$sent")" == "$limits" ]] && return 0
  last="$(zstat +mtime "$sent")"
  [[ "$last" == <-> ]] && (( $(date +%s) - last < 60 )) && return 0
  # Marked first, so a status line redrawn while this sends doesn't send again. The send lets go
  # of stdout, or Claude Code would wait for it to close
  print -r -- "$limits" > "$sent"
  ( send "$limits" ) </dev/null >/dev/null 2>&1 &!
  return 0
}

main() {
  local payload limits
  payload="$(cat)"
  jq -r '
    def pct: "\(. | floor)%";
    [ .model.display_name // empty,
      ((.workspace.current_dir // .cwd // "") | split("/") | last // "" | select(. != "")),
      (.rate_limits.five_hour.used_percentage // empty | "5h \(pct)"),
      (.rate_limits.seven_day.used_percentage // empty | "7d \(pct)") ] | join(" · ")' <<<"$payload" ||
    print
  # Only the two plan windows, each with both numbers; percentages to the column's two decimals
  limits="$(jq -cS '
    .rate_limits // {} | {five_hour, seven_day}
    | with_entries(select((.value.used_percentage | type) == "number" and (.value.resets_at | type) == "number")
        | .value = {used_percentage: (.value.used_percentage * 100 | round / 100), resets_at: (.value.resets_at | floor)})' \
    <<<"$payload")" || return 0
  [[ -n "$limits" && "$limits" != '{}' ]] || return 0
  record "$limits"
}

main
exit 0

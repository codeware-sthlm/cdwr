#!/bin/bash
# The trigger of the NUC's root installer. Run by cdwr-agent-nuc.timer every 5 minutes as cdwr,
# which may run exactly one thing as root: `sudo /usr/local/sbin/nuc-apply <sha>` (nuc-apply.sh).
# Each tick reads main's head, then the newest commit in its history that touches
# apps/agent-host/nuc, and when that commit is not the one in nuc-apply.json (applied or failed), runs nuc-apply on it.
# It writes {sha, main, at, phase: ok|failed, changed, reason} to /opt/cdwr-agent/nuc-apply.json
# and, through `deploy-gate.sh nuc-record`, to the queue home, where the apply kind `nuc-install`
# reads it, again on later ticks until the container took it. A failure sends one notice and is not
# retried until main changes the folder again, or the state file is removed.
# Needs bash, curl, jq, sudo and docker on the host. NUC_SYNC_* replace paths, times and endpoints in specs.

set -u -o pipefail

DIR="${NUC_SYNC_DIR:-/opt/cdwr-agent}"
CONTAINER=cdwr-agent
REPO=codeware-sthlm/cdwr
FOLDER=apps/agent-host/nuc
API="${NUC_SYNC_API:-https://api.github.com}"
APPLY=/usr/local/sbin/nuc-apply
GATE=/opt/agent-queue/deploy-gate.sh
# A plain docker exec has none of the vault's keys, the Slack webhook among them
SECRETS=/opt/agent-host/secrets.sh
STATE="$DIR/nuc-apply.json"

log() { printf 'nuc-sync: %s\n' "$*"; }
now() { printf '%s' "${NUC_SYNC_NOW:-$(date +%s)}"; }
iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ; }

get() { curl -fsS --max-time 20 -H 'Accept: application/vnd.github+json' "$@"; }
notice() { docker exec "$CONTAINER" "$SECRETS" "$GATE" notify "$*" >/dev/null 2>&1 || log "the notice failed: $*"; }

# Sends the state file, without its own `recorded`, to the container, and marks it recorded once the
# container took it. A container that was down (a self-deploy restarts it) gets it on a later tick.
push_record() {
  jq -c 'del(.recorded)' "$STATE" 2>/dev/null | docker exec -i "$CONTAINER" "$GATE" nuc-record >/dev/null 2>&1 || {
    log "could not record the nuc-apply in the container: trying on the next tick"
    return 0
  }
  jq -c '.recorded = true' "$STATE" > "$STATE.tmp" 2>/dev/null && mv -f "$STATE.tmp" "$STATE"
}

# Global, since the EXIT trap that removes it runs after main returned
err=""

main() {
  local sha head last out phase reason changed body
  # The folder's newest commit in that head's history, not main's: a merge between the two reads
  # would make `main` claim a change nuc-apply never saw
  head="$(get "$API/repos/$REPO/commits/main" | jq -r '.sha // empty')"
  [[ "$head" =~ ^[0-9a-f]{40}$ ]] || { log "could not read main's head"; return 0; }
  sha="$(get "$API/repos/$REPO/commits?sha=$head&path=$FOLDER&per_page=1" | jq -r '.[0].sha // empty')"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { log "could not read the newest commit under $FOLDER at ${head:0:7}"; return 0; }

  last="$(jq -r '.sha // empty' "$STATE" 2>/dev/null)"
  if [[ "$sha" == "$last" ]]; then
    [[ "$(jq -r '.recorded // false' "$STATE" 2>/dev/null)" == true ]] || push_record
    return 0
  fi

  err="$(mktemp)"
  trap '[[ -n "$err" ]] && rm -f "$err"' EXIT
  if out="$(sudo -n "$APPLY" "$sha" 2>"$err")" && changed="$(jq -c '.changed // [] | map(strings)' <<<"$out" 2>/dev/null)" && [[ -n "$changed" ]]; then
    phase=ok reason=""
    log "applied ${sha:0:7}: $(jq -r 'join(", ") | if . == "" then "nothing differed" else . end' <<<"$changed")"
  else
    phase=failed changed='[]'
    reason="$(grep -v '^[[:space:]]*$' "$err" | tail -n 1)"
    reason="${reason:-nuc-apply exited without a reason}"
    log "nuc-apply of ${sha:0:7} failed: $reason"
  fi

  body="$(jq -nc --arg sha "$sha" --arg main "$head" --arg at "$(iso "$(now)")" --arg phase "$phase" \
    --argjson changed "$changed" --arg reason "$reason" '
    {sha: $sha, main: $main, at: $at, phase: $phase, changed: $changed,
     reason: (if $reason == "" then null else $reason end)}')"
  if printf '%s\n' "$body" > "$STATE.tmp" && mv -f "$STATE.tmp" "$STATE"; then
    push_record
  else
    log "could not write $STATE"
  fi
  [[ "$phase" == failed ]] &&
    notice "agent-host: nuc-apply of ${sha:0:7} failed: $reason. To retry, remove /opt/cdwr-agent/nuc-apply.json on the NUC"
  return 0
}

main

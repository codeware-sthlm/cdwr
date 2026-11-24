#!/bin/bash
# The trigger of the NUC's root installer. Run by cdwr-agent-nuc.timer every 5 minutes as cdwr,
# which may run exactly one thing as root: `sudo /usr/local/sbin/nuc-apply <sha>` (nuc-apply.sh).
# Each tick reads main's head, then the newest commit in its history that touches
# apps/agent-host/nuc, and when that commit is not the one in nuc-apply.json (applied or failed), runs nuc-apply on it.
# It writes {sha, main, at, phase: ok|failed, changed, reason} to /opt/cdwr-agent/nuc-apply.json
# and, through `deploy-gate.sh nuc-record`, to the queue home, where the apply kind `nuc-install`
# reads it, again on later ticks until the container took it. A failure sends one notice and is not
# retried until main changes the folder again, or the state file is removed.
# Its REST reads sign with the read-only token in /etc/cdwr-agent/github-read.token when it is there,
# as self-deploy.sh does. A read that fails, nuc-apply's rate limit (exit 75) included, is tried
# again next tick and leaves nuc-apply.json alone; once it lasts 30 minutes, one notice goes out
# (self-deploy.sh already notices a rate limit at once), and nothing more until a read succeeds.
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
# {since, noticed} while reads fail
READ_STATE="$DIR/nuc-sync-read.json"
STALL_SECONDS="${NUC_SYNC_STALL_SECONDS:-1800}"
TOKEN_FILE="${NUC_SYNC_TOKEN_FILE:-/etc/cdwr-agent/github-read.token}"
# The token file's mtime once GitHub refused it, shared with self-deploy.sh
REFUSED="$DIR/github-read.refused"

log() { printf 'nuc-sync: %s\n' "$*"; }
now() { printf '%s' "${NUC_SYNC_NOW:-$(date +%s)}"; }
iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ; }

notice() { docker exec "$CONTAINER" "$SECRETS" "$GATE" notify "$*" >/dev/null 2>&1 && return 0; log "the notice failed: $*"; return 1; }

# Sends the state file, without its own `recorded`, to the container, and marks it recorded once the
# container took it. A container that was down (a self-deploy restarts it) gets it on a later tick.
push_record() {
  jq -c 'del(.recorded)' "$STATE" 2>/dev/null | docker exec -i "$CONTAINER" "$GATE" nuc-record >/dev/null 2>&1 || {
    log "could not record the nuc-apply in the container: trying on the next tick"
    return 0
  }
  jq -c '.recorded = true' "$STATE" > "$STATE.tmp" 2>/dev/null && mv -f "$STATE.tmp" "$STATE"
}

mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null; }

# The read-only token, when installed and not refused; empty reads anonymously, and anon says why
token=""
anon="; read anonymously, no token in $TOKEN_FILE"
if [[ -r "$TOKEN_FILE" ]]; then
  token="$(tr -d '[:space:]' < "$TOKEN_FILE")"
  if ! [[ "$token" =~ ^(github_pat_|gh[pousr]_)[A-Za-z0-9_]+$ ]]; then
    log "$TOKEN_FILE holds no token: reading anonymously"
    token=""
  elif [[ -s "$REFUSED" && "$(cat "$REFUSED" 2>/dev/null)" == "$(mtime "$TOKEN_FILE")" ]]; then
    token=""
    anon="; read anonymously, GitHub refused the token in $TOKEN_FILE"
  else
    anon=""
  fi
fi

# Global, since the EXIT trap that removes it runs after main returned
http="$(mktemp -d)" || { log "could not make a temp folder"; exit 1; }
trap 'rm -rf "$http"' EXIT
err="$http/err"

# fetch <url> [signed]: prints the status, with the body and headers in $http. The token goes in
# through a file descriptor, never argv.
fetch() {
  if [[ "${2:-}" == signed ]]; then
    curl -sS --max-time 20 -D "$http/head" -o "$http/body" -w '%{http_code}' -H 'Accept: application/vnd.github+json' \
      -H @<(printf 'Authorization: Bearer %s\n' "$token") "$1"
  else
    curl -sS --max-time 20 -D "$http/head" -o "$http/body" -w '%{http_code}' -H 'Accept: application/vnd.github+json' "$1"
  fi
}
header() {
  tr -d '\r' < "$http/head" 2>/dev/null |
    awk -v k="$1" 'index(tolower($0), k ":") == 1 { sub(/^[^:]*:[ \t]*/, ""); v = $0 } END { print v }'
}

# One REST read: the body on stdout, or false with why in $http/why. A refused token (401: expired
# or revoked) reads once more without it and leaves $http/refused, so the tick's later reads go
# anonymous too.
get() {
  local code note="$anon" retry ends=""
  rm -f "$http/head" "$http/body" "$http/why"
  if [[ -n "$token" && ! -e "$http/refused" ]]; then
    code="$(fetch "$1" signed)"
    if [[ "$code" == 401 ]]; then
      : > "$http/refused"
      code="$(fetch "$1")"
    fi
  else
    code="$(fetch "$1")"
  fi
  [[ -e "$http/refused" ]] && note="; read anonymously, GitHub refused the token in $TOKEN_FILE"
  [[ "$code" == 2?? ]] && { cat "$http/body"; return 0; }
  # The hourly limit used up says when it resets; a secondary limit only how long to wait
  if [[ "$code" == 403 || "$code" == 429 ]]; then
    retry="$(header retry-after)"
    if [[ "$(header x-ratelimit-remaining)" == 0 && "$(header x-ratelimit-reset)" =~ ^[0-9]+$ ]]; then
      ends="$(header x-ratelimit-reset)"
    elif [[ "$retry" =~ ^[0-9]+$ ]]; then
      ends=$(( $(now) + retry ))
    fi
  fi
  if [[ "$ends" =~ ^[0-9]+$ ]]; then
    printf 'rate limited until %s%s' "$(date -u -d "@$ends" +%H:%MZ)" "$note" > "$http/why"
    return 1
  fi
  [[ "$code" =~ ^[1-9] ]] || code="no answer"
  printf 'GitHub answered %s%s' "$code" "${note#"$anon"}" > "$http/why"
  return 1
}

# Once per token: a refused one is marked, so neither host script signs with it again until the
# file is replaced, and told once
token_refused() {
  [[ -e "$http/refused" && ! -e "$http/refused-told" ]] || return 0
  : > "$http/refused-told"
  mtime "$TOKEN_FILE" > "$REFUSED" 2>/dev/null || log "could not write $REFUSED"
  log "GitHub refused the token in $TOKEN_FILE: reading anonymously until it is replaced"
  notice "agent-host: GitHub refused the read-only token in $TOKEN_FILE (expired or revoked?), so the host reads anonymously and shares the IP's 60 calls an hour. Make a new one: apps/agent-host/README.md, Installing the token"
}

# read_failed <what>: logged each tick; one notice once it lasts STALL_SECONDS, then none until a
# read succeeds. Never touches nuc-apply.json.
read_failed() {
  local why since
  why="$(cat "$http/why" 2>/dev/null)"
  why="${why:-the read failed}"
  log "$1: $why"
  since="$(jq -r '.since // empty' "$READ_STATE" 2>/dev/null)"
  if ! [[ "$since" =~ ^[0-9]+$ ]]; then
    since="$(now)"
    jq -nc --arg s "$since" '{since: ($s | tonumber), noticed: false}' > "$READ_STATE"
  fi
  [[ "$(jq -r '.noticed' "$READ_STATE" 2>/dev/null)" == true ]] && return 0
  (( $(now) - since >= STALL_SECONDS )) || return 0
  notice "agent-host: nuc-sync cannot read GitHub ($why), so main's apps/agent-host/nuc is not installed until it can. The read-only token is /etc/cdwr-agent/github-read.token, see apps/agent-host/README.md" &&
    jq -nc --arg s "$since" '{since: ($s | tonumber), noticed: true}' > "$READ_STATE"
  return 0
}
read_ok() { rm -f "$READ_STATE"; }

main() {
  local sha head last out phase reason changed body rc
  # The folder's newest commit in that head's history, not main's: a merge between the two reads
  # would make `main` claim a change nuc-apply never saw
  head="$(get "$API/repos/$REPO/commits/main" | jq -r '.sha // empty')"
  token_refused
  [[ "$head" =~ ^[0-9a-f]{40}$ ]] || { read_failed "could not read main's head"; return 0; }
  sha="$(get "$API/repos/$REPO/commits?sha=$head&path=$FOLDER&per_page=1" | jq -r '.[0].sha // empty')"
  token_refused
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { read_failed "could not read the newest commit under $FOLDER at ${head:0:7}"; return 0; }

  last="$(jq -r '.sha // empty' "$STATE" 2>/dev/null)"
  if [[ "$sha" == "$last" ]]; then
    read_ok
    [[ "$(jq -r '.recorded // false' "$STATE" 2>/dev/null)" == true ]] || push_record
    return 0
  fi

  out="$(sudo -n "$APPLY" "$sha" 2>"$err")"
  rc=$?
  # Rate limited: its last line says until when, and the same sha runs again next tick
  if (( rc == 75 )); then
    grep -v '^[[:space:]]*$' "$err" | tail -n 1 | sed 's/^nuc-apply: //' > "$http/why"
    read_failed "nuc-apply of ${sha:0:7} could not read GitHub"
    return 0
  fi
  read_ok
  if (( rc == 0 )) && changed="$(jq -c '.changed // [] | map(strings)' <<<"$out" 2>/dev/null)" && [[ -n "$changed" ]]; then
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

#!/bin/bash
# The NUC deploys the agent image itself. Run by cdwr-agent-deploy.timer every 5 minutes as the
# deploy user (cdwr: owns /opt/cdwr-agent, in the docker group). The container gets no Docker
# socket; this script reaches in only through deploy-gate.sh. Each tick does one of:
#   - checking: the last deploy waits for its first run. A fresh job.json from the new image with
#     nothing in `differs` (or a newer run already on main) makes it ok; a container that stopped,
#     or no such job.json in 20 minutes (a `differs` with no newer run on main) rolls it back.
#     A queue paused by hand is not deployed to.
#   - otherwise: when the newest green agent-host-image.yml build on main is not the running tag,
#     not a tag that was rolled back and not held by `cdwr agent deploy --tag`, pause the queue,
#     wait up to 30 minutes for it to be quiet, pull, `up -d agent`, resume, and start checking.
# Needs bash, curl, jq and docker on the host. SELF_DEPLOY_* replace paths, times and endpoints in specs.

set -u -o pipefail

DIR="${SELF_DEPLOY_DIR:-/opt/cdwr-agent}"
CONTAINER=cdwr-agent
SERVICE=agent
REPO=codeware-sthlm/cdwr
WORKFLOW=agent-host-image.yml
API="${SELF_DEPLOY_API:-https://api.github.com}"
RAW="${SELF_DEPLOY_RAW:-https://raw.githubusercontent.com}"
GATE=/opt/agent-queue/deploy-gate.sh
# A plain docker exec has none of the vault's keys, the Slack webhook among them
SECRETS=/opt/agent-host/secrets.sh
STATE="$DIR/self-deploy.json"
HOLD="$DIR/hold"
WAIT_SECONDS="${SELF_DEPLOY_WAIT_SECONDS:-1800}"
POLL_SECONDS="${SELF_DEPLOY_POLL_SECONDS:-10}"
CHECK_SECONDS="${SELF_DEPLOY_CHECK_SECONDS:-1200}"

log() { printf 'self-deploy: %s\n' "$*"; }
now() { printf '%s' "${SELF_DEPLOY_NOW:-$(date +%s)}"; }
iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ; }

compose() {
  docker compose --project-directory "$DIR" -f "$DIR/compose.yaml" --env-file "$DIR/image.env" "$@"
}
gate() { docker exec "$CONTAINER" "$GATE" "$@"; }
notice() { docker exec "$CONTAINER" "$SECRETS" "$GATE" notify "$*" >/dev/null 2>&1 || log "the notice failed: $*"; }
running() { [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" == true ]]; }
current_tag() { sed -n 's/^AGENT_IMAGE_TAG=//p' "$DIR/image.env" 2>/dev/null | head -n 1; }

# The state file's field, empty when unset
field() { jq -r --arg k "$1" '.[$k] // empty | if type == "array" then join(" ") else . end' "$STATE" 2>/dev/null; }

# Writes the state file, merging the given JSON object into what is there
save() {
  local old='{}'
  [[ -f "$STATE" ]] && old="$(cat "$STATE")"
  jq -c --argjson new "$1" '(. // {}) + $new' <<<"$old" > "$STATE.tmp" 2>/dev/null && mv -f "$STATE.tmp" "$STATE"
}

# What the desk reads: deploy.json in the queue home, written through the gate
record() {
  jq -nc --arg tag "$1" --arg previous "$2" --arg at "$3" --arg phase "$4" --arg reason "${5:-}" --arg failed "${6:-}" '
    def orNull: if . == "" then null else . end;
    {tag: $tag, previous: ($previous | orNull), at: $at, by: "self", phase: $phase,
     reason: ($reason | orNull), failed: ($failed | orNull)}' |
    docker exec -i "$CONTAINER" "$GATE" record >/dev/null 2>&1 || log "could not record the deploy in the container"
}

# Prints `<newest green sha> <newest run sha>`: the newest run on main, whatever its state, says
# whether main has moved past a build (running, failed or green)
builds() {
  curl -fsS --max-time 20 -H 'Accept: application/vnd.github+json' \
    "$API/repos/$REPO/actions/workflows/$WORKFLOW/runs?branch=main&per_page=20" |
    jq -r '.workflow_runs as $r
      | ([$r[] | select(.conclusion == "success")][0].head_sha // "") as $sha
      | ($r[0].head_sha // "") as $head
      | if ($sha | test("^[0-9a-f]{40}$")) then "\($sha) \($head)" else error("no green build") end'
}

rollback() {
  local tag=$1 previous=$2 reason=$3 failed at
  log "rolling back $tag to $previous: $reason"
  cp -f "$DIR/image.env.previous" "$DIR/image.env" && cp -f "$DIR/compose.yaml.previous" "$DIR/compose.yaml" || {
    log "no previous files to roll back to"
    save "$(jq -nc --arg t "$tag" --arg r "$reason" '{phase: "stuck", tag: $t, reason: $r}')"
    record "$tag" "$previous" "$(iso "$(now)")" stuck "$reason; there are no previous files" "$tag"
    notice "agent-host: $tag failed its check ($reason) and has no previous files to roll back to. Deploy by hand with cdwr agent deploy --host agent-host --tag <tag>"
    return 1
  }
  failed="$(field failed)"
  if ! compose up -d "$SERVICE"; then
    log "up -d $SERVICE failed on the rollback to $previous"
    save "$(jq -nc --arg t "$tag" --arg r "$reason" --arg f "$failed $tag" \
      '{phase: "stuck", tag: $t, reason: $r, failed: ($f | split(" ") | map(select(. != "")) | unique)}')"
    record "$tag" "$previous" "$(iso "$(now)")" stuck "$reason; the rollback to $previous did not start" "$tag"
    notice "agent-host: $tag failed its check ($reason) and the rollback to $previous did not start. Deploy by hand with cdwr agent deploy --host agent-host --tag <tag>"
    return 1
  fi
  at="$(now)"
  save "$(jq -nc --arg t "$previous" --arg p "$tag" --arg at "$at" --arg r "$reason" --arg f "$failed $tag" \
    '{phase: "rolled-back", tag: $t, previous: $p, at: ($at | tonumber), reason: $r,
      failed: ($f | split(" ") | map(select(. != "")) | unique)}')"
  record "$previous" "$tag" "$(iso "$at")" rolled-back "$reason" "$tag"
  notice "agent-host rolled back $tag to $previous: $reason. Deploy by hand with cdwr agent deploy --host agent-host --tag <tag>"
}

# The health check of the last deploy; returns 0 when it is decided, so the tick goes on
check() {
  local tag previous at deployed job job_at job_sha differs out sha head
  tag="$(field tag)" previous="$(field previous)" at="$(field at)"
  # A deploy from the Mac replaced ours: nothing of ours to check
  if [[ "$(current_tag)" != "$tag" ]]; then
    log "image.env names $(current_tag), not $tag: a deploy by hand took over"
    save '{"phase": "superseded"}'
    return 0
  fi
  deployed="${tag#sha-}"
  if ! running; then
    # Give a restart a couple of minutes before calling it broken
    if (( $(now) - at < 120 )); then log "$tag is not running yet"; return 1; fi
    rollback "$tag" "$previous" "the container is not running"
    return 1
  fi
  job="$(gate job 2>/dev/null)"
  job_at="$(jq -r '.at // empty | fromdateiso8601' <<<"$job" 2>/dev/null)"
  job_sha="$(jq -r '.imageSha // empty' <<<"$job" 2>/dev/null)"
  if [[ "$job_at" =~ ^[0-9]+$ ]] && (( job_at > at )) && [[ "$job_sha" == "$deployed"* ]]; then
    differs="$(jq -r 'if .differs == null then "unknown" else (.differs | join(", ")) end' <<<"$job" 2>/dev/null)"
    # A run that could not read main still proves the image boots; the scripts get compared next time
    if [[ -z "$differs" || "$differs" == unknown ]]; then
      log "$tag is healthy${differs:+ (main was unreadable from its first run)}"
      save '{"phase": "ok"}'
      record "$tag" "$previous" "$(iso "$at")" ok
      return 0
    fi
    # A merge since makes the scripts differ too, whether its build runs, failed or is green
    if out="$(builds)"; then
      read -r sha head <<<"$out"
      if [[ -n "$head" && "$head" != "$deployed"* ]]; then
        log "$tag differs from main ($differs), but main built ${head:0:7} since: ok, a green build of it gets deployed"
        save '{"phase": "ok"}'
        record "$tag" "$previous" "$(iso "$at")" ok
        return 0
      fi
    fi
    # A paused tick compares with the main it fetched last, so only the deadline makes it a verdict
    if (( $(now) - at >= CHECK_SECONDS )); then
      rollback "$tag" "$previous" "its first run still differs from main ($differs)"
      return 1
    fi
    log "$tag differs from main ($differs): waiting for a run that reads main again"
    return 1
  fi
  if (( $(now) - at >= CHECK_SECONDS )); then
    rollback "$tag" "$previous" "no healthy run within $(( CHECK_SECONDS / 60 )) minutes"
    return 1
  fi
  log "$tag: waiting for its first run"
  return 1
}

# Polls the gate until the queue is not working; false when the time runs out
quiet_within() {
  local until=$(( $(now) + $1 )) state
  while :; do
    state="$(gate state 2>/dev/null)"
    [[ "$state" == none || "$state" == waiting ]] && return 0
    (( $(now) >= until )) && return 1
    sleep "$POLL_SECONDS"
  done
}

deploy() {
  local sha=$1 tag=$2 previous created at compose_tmp
  previous="$(current_tag)"
  if ! running; then log "$CONTAINER is not running: deploy $tag by hand"; return 0; fi
  if ! docker exec "$CONTAINER" test -x "$GATE"; then
    log "the running image has no deploy-gate.sh: deploy $tag once by hand with cdwr agent deploy"
    return 0
  fi
  compose_tmp="$DIR/compose.yaml.next"
  if ! curl -fsS --max-time 20 -o "$compose_tmp" "$RAW/$REPO/$sha/apps/agent-host/compose.yaml" || [[ ! -s "$compose_tmp" ]]; then
    log "could not fetch compose.yaml at ${sha:0:7}"
    rm -f "$compose_tmp"
    return 1
  fi

  created="$(gate pause 2>/dev/null)"
  # A pause made by hand means hands off: its ticks never fetch main, so no check could pass
  if [[ "$created" == kept ]]; then
    log "the queue is paused by hand: not deploying $tag"
    rm -f "$compose_tmp"; return 0
  fi
  # Without its own pause nothing keeps the queue from starting work under the restart
  if [[ "$created" != created ]]; then
    log "could not pause the queue: trying $tag on the next tick"
    rm -f "$compose_tmp"; return 1
  fi
  unpause() { [[ "$created" == created ]] && gate unpause >/dev/null 2>&1; return 0; }
  restore() { cp -f "$DIR/image.env.previous" "$DIR/image.env"; cp -f "$DIR/compose.yaml.previous" "$DIR/compose.yaml"; }
  # systemd's stop or timeout: leave the files and the queue as they were before this tick
  swapped=false
  stop() { log "stopped while deploying $tag"; $swapped && restore; rm -f "$compose_tmp"; unpause; exit 143; }
  trap stop TERM INT
  if ! quiet_within "$WAIT_SECONDS"; then
    log "the queue stayed busy for $(( WAIT_SECONDS / 60 )) minutes: trying $tag on the next tick"
    unpause; rm -f "$compose_tmp"; return 0
  fi

  cp -f "$DIR/image.env" "$DIR/image.env.previous" && cp -f "$DIR/compose.yaml" "$DIR/compose.yaml.previous" || {
    log "could not keep the previous files"; unpause; rm -f "$compose_tmp"; return 1
  }
  swapped=true
  mv -f "$compose_tmp" "$DIR/compose.yaml"
  printf 'AGENT_IMAGE_TAG=%s\n' "$tag" > "$DIR/image.env"
  if ! compose pull "$SERVICE"; then
    log "pull of $tag failed: trying on the next tick"
    restore; unpause; return 1
  fi
  # The pull takes a while: a session may have gone back to work
  if ! quiet_within 0; then
    log "the queue went back to work during the pull: trying $tag on the next tick"
    restore; unpause; return 0
  fi
  if ! compose up -d "$SERVICE"; then
    log "up -d $SERVICE failed on $tag"
    restore; compose up -d "$SERVICE"; unpause; return 1
  fi
  # The new container runs: from here a stop only lifts the pause
  swapped=false
  # The new container reads the volume's paused file as it starts
  if [[ "$created" == created ]]; then
    for _ in 1 2 3; do gate unpause >/dev/null 2>&1 && break; sleep 2; done
  fi
  at="$(now)"
  save "$(jq -nc --arg t "$tag" --arg p "$previous" --arg s "$sha" --arg at "$at" \
    '{phase: "checking", tag: $t, previous: $p, sha: $s, at: ($at | tonumber), reason: null}')"
  record "$tag" "$previous" "$(iso "$at")" checking
  log "deployed $tag (was $previous), checking its first run"
}

main() {
  local out sha tag held
  [[ -f "$DIR/image.env" && -f "$DIR/compose.yaml" ]] || { log "no deploy in $DIR yet: run cdwr agent deploy once"; return 0; }
  if [[ "$(field phase)" == checking ]]; then
    check || return 0
  fi
  out="$(builds)" || { log "could not read the image builds on main"; return 0; }
  read -r sha _ <<<"$out"
  tag="sha-${sha:0:7}"
  [[ "$tag" == "$(current_tag)" ]] && return 0
  if [[ " $(field failed) " == *" $tag "* ]]; then log "$tag was rolled back once: waiting for a newer build"; return 0; fi
  # `cdwr agent deploy --tag` holds an older tag until main builds past the build it saw
  if [[ -f "$HOLD" ]]; then
    held="$(tr -d '[:space:]' < "$HOLD")"
    if [[ "$held" == "$tag" ]]; then log "held on $(current_tag) by a deploy by hand"; return 0; fi
    log "main built $tag past the hold on $held: the hold ends"
    rm -f "$HOLD"
  fi
  deploy "$sha" "$tag"
}

main

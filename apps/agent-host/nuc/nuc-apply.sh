#!/bin/bash
# The NUC's root installer: installs what main ships under apps/agent-host/nuc, and nothing else.
# Installed once by hand as /usr/local/sbin/nuc-apply (root, 755); cdwr runs it through the one
# sudoers line `cdwr ALL=(root) NOPASSWD: /usr/local/sbin/nuc-apply`, from nuc-sync.sh.
#
#   nuc-apply <40-hex commit sha>
#
# It takes that one argument and runs no git: a checkout cdwr can write would run its own
# .git/config as root. Instead it:
#   - checks that main contains the sha (GitHub compare main...<sha> reads behind or identical)
#   - lists apps/agent-host/nuc at the sha (contents API); a name outside
#     ^[a-z0-9-]+\.(sh|service|timer)$ or a subfolder fails the run before anything is installed
#   - fetches each file at the sha from raw.githubusercontent.com
#   - installs each one that differs (cmp): *.sh to /usr/local/sbin (755), *.service and *.timer
#     to /etc/systemd/system (644), all owned by root; nuc-apply.sh itself last, as
#     /usr/local/sbin/nuc-apply by temp file and rename, so this run finishes as it started
#   - after a unit changed, daemon-reload, then enable and restart each changed timer. A service
#     only reloads: they are oneshots their timers fire, and restarting cdwr-agent-deploy.service
#     would start a deploy. Each installed unit is noted in a pending file until systemd has it,
#     so a run that failed in between finishes that unit on the next run, even though cmp matches
# It never removes a file main deleted, never writes under /etc/sudoers.d and never installs
# from a branch. On success it prints {"sha": …, "changed": [names]} on stdout; logs go to stderr.
# Its REST reads sign with the read-only token in /etc/cdwr-agent/github-read.token when it is there,
# as self-deploy.sh does. Rate limited, it exits 75, so nuc-sync.sh tries again instead of failing.
# Needs bash, curl, jq, flock, cmp, install and systemctl. NUC_APPLY_* replace paths and endpoints
# in specs, and only when not run as root: sudo's env_reset drops them anyway.

set -u -o pipefail
umask 022

REPO=codeware-sthlm/cdwr
FOLDER=apps/agent-host/nuc
if (( EUID == 0 )); then
  API=https://api.github.com
  RAW=https://raw.githubusercontent.com
  SBIN=/usr/local/sbin
  UNITS=/etc/systemd/system
  LOCK=/run/nuc-apply.lock
  PENDING=/var/lib/nuc-apply/pending
  TOKEN_FILE=/etc/cdwr-agent/github-read.token
else
  API="${NUC_APPLY_API:-https://api.github.com}"
  RAW="${NUC_APPLY_RAW:-https://raw.githubusercontent.com}"
  SBIN="${NUC_APPLY_SBIN:-/usr/local/sbin}"
  UNITS="${NUC_APPLY_UNITS:-/etc/systemd/system}"
  LOCK="${NUC_APPLY_LOCK:-/run/nuc-apply.lock}"
  PENDING="${NUC_APPLY_PENDING:-/var/lib/nuc-apply/pending}"
  TOKEN_FILE="${NUC_APPLY_TOKEN_FILE:-/etc/cdwr-agent/github-read.token}"
fi

log() { printf 'nuc-apply: %s\n' "$*" >&2; }
fail() { log "$*"; exit 1; }

# The read-only token, when installed; empty reads anonymously
token=""
if [[ -r "$TOKEN_FILE" ]]; then
  token="$(tr -d '[:space:]' < "$TOKEN_FILE")"
  [[ "$token" =~ ^(github_pat_|gh[pousr]_)[A-Za-z0-9_]+$ ]] || { log "$TOKEN_FILE holds no token: reading anonymously"; token=""; }
fi

# Global, since the EXIT trap that removes it runs after main returned
tmp=""
http=""

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

# One REST read: the body on stdout, or false with why in $http/why, and $http/limited when GitHub
# says it is rate limited. A refused token (401, expired or revoked) reads once more without it.
get() {
  local code refused="" anon="" retry ends=""
  rm -f "$http/head" "$http/body" "$http/why" "$http/limited"
  # A token refused once in this run is not sent again
  [[ -e "$http/refused" ]] && refused="; the token in $TOKEN_FILE was refused"
  if [[ -n "$token" && ! -e "$http/refused" ]]; then
    code="$(fetch "$1" signed)"
    if [[ "$code" == 401 ]]; then
      : > "$http/refused"
      refused="; the token in $TOKEN_FILE was refused"
      code="$(fetch "$1")"
    fi
  elif [[ -n "$token" ]]; then
    code="$(fetch "$1")"
  else
    anon="; read anonymously, no token in $TOKEN_FILE"
    code="$(fetch "$1")"
  fi
  [[ "$code" == 2?? ]] && { cat "$http/body"; return 0; }
  # The hourly limit used up says when it resets; a secondary limit only how long to wait
  if [[ "$code" == 403 || "$code" == 429 ]]; then
    retry="$(header retry-after)"
    if [[ "$(header x-ratelimit-remaining)" == 0 && "$(header x-ratelimit-reset)" =~ ^[0-9]+$ ]]; then
      ends="$(header x-ratelimit-reset)"
      : > "$http/limited"
    elif [[ "$retry" =~ ^[0-9]+$ ]]; then
      ends=$(( $(date +%s) + retry ))
    fi
  fi
  if [[ "$ends" =~ ^[0-9]+$ ]]; then
    printf 'rate limited until %s%s%s' "$(date -u -d "@$ends" +%H:%MZ)" "$refused" "$anon" > "$http/why"
    : > "$http/limited"
    return 1
  fi
  [[ "$code" =~ ^[1-9] ]] || code="no answer"
  printf 'GitHub answered %s%s' "$code" "$refused" > "$http/why"
  return 1
}

# A failed read: exit 75 when rate limited, else fail with what GitHub said
read_fail() {
  local why
  why="$(cat "$http/why" 2>/dev/null)"
  if [[ -e "$http/limited" ]]; then log "$1: $why"; exit 75; fi
  fail "$1${why:+: $why}"
}

# The target of a file in the folder, by its name alone
target() {
  case "$1" in
    nuc-apply.sh) printf '%s/nuc-apply' "$SBIN" ;;
    *.sh) printf '%s/%s' "$SBIN" "$1" ;;
    *) printf '%s/%s' "$UNITS" "$1" ;;
  esac
}

mode() { [[ "$1" == *.sh ]] && printf 755 || printf 644; }

main() {
  local sha status listing name unit
  local -a names=() changed=() units=()

  if (( $# != 1 )) || [[ ! "$1" =~ ^[0-9a-f]{40}$ ]]; then
    log "usage: nuc-apply <40-hex commit sha on main>"
    exit 2
  fi
  sha=$1

  exec 9>>"$LOCK" || fail "could not open $LOCK"
  flock -n 9 || fail "another nuc-apply holds $LOCK"

  tmp="$(mktemp -d)" || fail "could not make a temp folder"
  trap '[[ -n "$tmp" ]] && rm -rf "$tmp"' EXIT
  # Apart from the downloads, whose names always have an extension
  http="$tmp/http"
  mkdir "$http" || fail "could not make $http"

  status="$(get "$API/repos/$REPO/compare/main...$sha" | jq -r '.status // empty')" ||
    read_fail "could not compare ${sha:0:7} with main"
  [[ "$status" == behind || "$status" == identical ]] ||
    fail "main does not contain ${sha:0:7} (compare reads ${status:-nothing})"

  listing="$(get "$API/repos/$REPO/contents/$FOLDER?ref=$sha" |
    jq -r 'if type == "array" then .[] | "\(.type) \(.name)" else error("not a folder") end')" ||
    read_fail "could not list $FOLDER at ${sha:0:7}"
  while read -r type name; do
    [[ -z "$name" ]] && continue
    [[ "$type" == file ]] || fail "$FOLDER/$name is a $type, not a file: nothing installed"
    [[ "$name" =~ ^[a-z0-9-]+\.(sh|service|timer)$ ]] ||
      fail "$FOLDER/$name has no fixed target: nothing installed"
    names+=("$name")
  done <<<"$listing"
  (( ${#names[@]} > 0 )) || fail "$FOLDER is empty at ${sha:0:7}: nothing installed"

  for name in "${names[@]}"; do
    if ! curl -fsS --max-time 20 -o "$tmp/$name" "$RAW/$REPO/$sha/$FOLDER/$name" || [[ ! -s "$tmp/$name" ]]; then
      fail "could not fetch $name at ${sha:0:7}: nothing installed"
    fi
  done

  # Units an earlier run installed but systemd never took, still shipped at this sha
  mkdir -p "$(dirname "$PENDING")" || fail "could not make $(dirname "$PENDING")"
  if [[ -f "$PENDING" ]]; then
    while read -r unit; do
      [[ " ${names[*]} " == *" $unit "* && "$unit" =~ \.(service|timer)$ ]] && units+=("$unit")
    done <"$PENDING"
  fi

  for name in "${names[@]}"; do
    [[ "$name" == nuc-apply.sh ]] && continue
    cmp -s "$tmp/$name" "$(target "$name")" && continue
    install -m "$(mode "$name")" -o root -g root "$tmp/$name" "$(target "$name")" ||
      fail "could not install $name to $(target "$name")"
    log "installed $name"
    changed+=("$name")
    if [[ "$name" != *.sh && " ${units[*]-} " != *" $name "* ]]; then
      units+=("$name")
      printf '%s\n' "$name" >>"$PENDING" || fail "could not note $name in $PENDING"
    fi
  done

  # ${units[@]+…}: bash before 4.4 calls an empty array unbound under set -u
  if (( ${#units[@]} > 0 )); then
    systemctl daemon-reload || fail "daemon-reload failed after installing ${units[*]}"
    for unit in "${units[@]}"; do
      [[ "$unit" == *.timer ]] || continue
      systemctl enable "$unit" && systemctl restart "$unit" || fail "could not enable and restart $unit"
      log "enabled and restarted $unit"
    done
  fi
  rm -f "$PENDING"

  # Last, so a new installer only runs from the next call on
  if [[ " ${names[*]} " == *" nuc-apply.sh "* ]] && ! cmp -s "$tmp/nuc-apply.sh" "$SBIN/nuc-apply"; then
    install -m 755 -o root -g root "$tmp/nuc-apply.sh" "$SBIN/.nuc-apply.new" &&
      mv -f "$SBIN/.nuc-apply.new" "$SBIN/nuc-apply" ||
      fail "could not install nuc-apply.sh to $SBIN/nuc-apply"
    log "installed nuc-apply.sh"
    changed+=(nuc-apply.sh)
  fi

  (( ${#changed[@]} > 0 )) || log "nothing differs at ${sha:0:7}"
  jq -nc --arg sha "$sha" '{sha: $sha, changed: $ARGS.positional}' --args ${changed[@]+"${changed[@]}"}
}

main "$@"

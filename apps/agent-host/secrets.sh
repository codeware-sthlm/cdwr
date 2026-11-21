#!/bin/zsh
# The container's entrypoint: fills the environment from Infisical /agent-queue, then execs the run
# loop (or the command given), so the loop stays tini's direct child and receives SIGTERM itself.
# Without INFISICAL_CLIENT_ID the environment is used as given (plain .env mode).
#
# The key secrets never reach the exec'd command's environment, so /proc/<pid>/environ of the loop
# and everything it starts holds none of them: they go to files on the tmpfs, mode 600, where
# lib.sh and the credential helper read them. In plain .env mode Docker still puts them in
# /proc/1/environ (tini), the weaker mode; the vault keeps them out of it.
#
# The run loop gets only what loop_env allows; every other vault key goes to vault.env on the same
# tmpfs, mode 600, where the scripts that need one read it as text. A command given on the line
# (`cdwr agent exec`, the self-deploy's notice) is a hand command with no claude in it, and gets
# the whole vault exported as before.
setopt err_exit pipe_fail no_unset

loop="${AGENT_HOST_LOOP:-/opt/agent-host/entrypoint.sh}"
typeset -a run
run=("$@")
(( ${#run} )) || run=("$loop")
is_loop=false
[[ "${run[1]}" == "$loop" ]] && is_loop=true

run_dir="${AGENT_HOST_RUN_DIR:-/run/agent}"
vault_file="${AGENT_QUEUE_VAULT_FILE:-$run_dir/vault.env}"

# What the loop may hold in its environment: what claude, git, the listener and the loop read from
# it, and the queue's non-secret settings. The Linear keys are AGENT_QUEUE_* too, and never get
# here: write_keys takes them first.
loop_env() {
  case "$1" in
    CLAUDE_CODE_OAUTH_TOKEN | AGENT_GITHUB_APP_ID | AGENT_GITHUB_APP_INSTALLATION_ID) return 0 ;;
    AGENT_SUPABASE_URL | AGENT_SUPABASE_ANON_KEY | SLACK_WEBHOOK_URL | SENTRY_DSN) return 0 ;;
    AGENT_QUEUE_* | RUN_* | HOST_METRICS_*) return 0 ;;
  esac
  return 1
}

typeset -a key_names
key_names=(AGENT_GITHUB_APP_KEY AGENT_QUEUE_LINEAR_KEY AGENT_QUEUE_LINEAR_CLIENT_ID AGENT_QUEUE_LINEAR_CLIENT_SECRET)
# The vault's key secrets, held here and never exported
typeset -A keys

# Writes through a temp file and a rename, so a reader never sees a half-written key
write_secret() {
  local file="$1"
  shift
  mkdir -p "${file:h}"
  (umask 077; print -rl -- "$@" > "$file.tmp")
  chmod 600 "$file.tmp"
  mv -f "$file.tmp" "$file"
}

# Each key from the vault, or from the environment where it was set (that wins), goes to its file
# and out of the environment. The file names are the ones lib.sh and entrypoint.sh read. A file
# whose secret is gone is removed, so a second run (`cdwr agent exec`) leaves no revoked key behind.
write_keys() {
  local name
  for name in "${key_names[@]}"; do
    [[ -n "${(P)name:-}" ]] && keys[$name]="${(P)name}"
    unset "$name"
  done
  local pem="$run_dir/app.pem"
  local key_file="${AGENT_QUEUE_LINEAR_KEY_FILE:-$run_dir/linear.key}"
  local app_file="${AGENT_QUEUE_LINEAR_APP_FILE:-$run_dir/linear-app.env}"
  if [[ -n "${keys[AGENT_GITHUB_APP_KEY]:-}" ]]; then
    write_secret "$pem" "${keys[AGENT_GITHUB_APP_KEY]}"
  else
    rm -f "$pem"
  fi
  if [[ -n "${keys[AGENT_QUEUE_LINEAR_KEY]:-}" ]]; then
    write_secret "$key_file" "${keys[AGENT_QUEUE_LINEAR_KEY]}"
  else
    rm -f "$key_file"
  fi
  if [[ -n "${keys[AGENT_QUEUE_LINEAR_CLIENT_ID]:-}" && -n "${keys[AGENT_QUEUE_LINEAR_CLIENT_SECRET]:-}" ]]; then
    write_secret "$app_file" \
      "AGENT_QUEUE_LINEAR_CLIENT_ID=${keys[AGENT_QUEUE_LINEAR_CLIENT_ID]}" \
      "AGENT_QUEUE_LINEAR_CLIENT_SECRET=${keys[AGENT_QUEUE_LINEAR_CLIENT_SECRET]}"
  else
    rm -f "$app_file"
  fi
  keys=()
  return 0
}

if [[ -z "${INFISICAL_CLIENT_ID:-}" ]]; then
  print -r -- "secrets: no INFISICAL_CLIENT_ID, using the environment as given"
  $is_loop && rm -f "$vault_file"
  write_keys
  exec "${run[@]}"
fi

typeset -a missing
for v in INFISICAL_CLIENT_SECRET INFISICAL_PROJECT_ID; do
  [[ -n "${(P)v:-}" ]] || missing+=("$v")
done
if (( ${#missing} )); then
  print -ru2 -- "secrets: missing ${(j:, :)missing}"
  exit 1
fi

# Same site names as the rest of the repo: eu, or us (the default)
case "${INFISICAL_SITE:-us}" in
  eu) domain=https://eu.infisical.com ;;
  us) domain=https://app.infisical.com ;;
  *) print -ru2 -- "secrets: INFISICAL_SITE must be eu or us"; exit 1 ;;
esac
environment="${INFISICAL_ENVIRONMENT:-production}"
folder="${INFISICAL_PATH:-/agent-queue}"

# The identity goes in through the CLI's own env vars, never argv, so it stays out of ps
token="$(
  INFISICAL_UNIVERSAL_AUTH_CLIENT_ID="$INFISICAL_CLIENT_ID" \
  INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET="$INFISICAL_CLIENT_SECRET" \
    infisical login --method=universal-auth --domain "$domain" --silent --plain
)" || { print -ru2 -- "secrets: Infisical login failed"; exit 1; }
[[ -n "$token" ]] || { print -ru2 -- "secrets: Infisical returned no token"; exit 1; }

vault="$(INFISICAL_TOKEN="$token" infisical export --domain "$domain" --silent \
  --projectId "$INFISICAL_PROJECT_ID" --env "$environment" --path "$folder" --format json)" ||
  { print -ru2 -- "secrets: reading $environment $folder failed"; exit 1; }

# Both shapes the CLI has used: [{key, value}] or {KEY: value}
pairs="$(jq -c 'if type == "array" then map({key, value}) else to_entries end | .[]' <<<"$vault")" ||
  { print -ru2 -- "secrets: the vault's answer is not JSON"; exit 1; }

typeset -a from_vault kept held vault_lines
[[ -n "$pairs" ]] || print -ru2 -- "secrets: $environment $folder holds no secrets"
while IFS= read -r pair; do
  [[ -n "$pair" ]] || continue
  key="$(jq -r .key <<<"$pair")"
  if [[ ! "$key" =~ '^[A-Z_][A-Z0-9_]*$' ]]; then
    print -ru2 -- "secrets: skipping a key that is not an env name"
    continue
  fi
  # Anything set on purpose (the compose .env) wins over the vault
  if [[ -n "${(P)key:-}" ]]; then
    kept+=("$key")
    continue
  fi
  value="$(jq -r .value <<<"$pair")"
  if (( ${key_names[(Ie)$key]} )); then
    keys[$key]="$value"
  elif $is_loop && ! loop_env "$key"; then
    # One KEY=value line each, read as text, so a value over several lines can't be one
    if [[ "$value" == *$'\n'* ]]; then
      print -ru2 -- "secrets: skipping $key, its value is not one line"
      continue
    fi
    vault_lines+=("$key=$value")
    held+=("$key")
  else
    export "$key=$value"
  fi
  from_vault+=("$key")
done <<<"$pairs"
value=

print -r -- "secrets: $environment $folder: ${#from_vault} from the vault${from_vault:+ (${(j:, :)from_vault})}"
(( ${#kept} )) && print -r -- "secrets: kept from the environment: ${(j:, :)kept}"
(( ${#held} )) && print -r -- "secrets: out of the loop's environment, in ${vault_file:t}: ${(j:, :)held}"

# Only the loop rewrites the file: a hand command exports what it needs and leaves the loop's alone
if $is_loop; then
  if (( ${#vault_lines} )); then write_secret "$vault_file" "${vault_lines[@]}"; else rm -f "$vault_file"; fi
fi
vault_lines=()

# Out of the loop's own environment. PID 1 (tini) still holds it in /proc/1/environ, readable by
# the same uid; accepted because the identity is a Viewer of a project that holds only this folder.
unset token vault pairs pair INFISICAL_CLIENT_SECRET INFISICAL_CLIENT_ID INFISICAL_TOKEN
write_keys
exec "${run[@]}"

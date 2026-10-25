#!/bin/zsh
# The container's entrypoint: fills the environment from Infisical /agent-queue, then execs the run
# loop (or the command given), so the loop stays tini's direct child and receives SIGTERM itself.
# Without INFISICAL_CLIENT_ID the environment is used as given (plain .env mode).
setopt err_exit pipe_fail no_unset

typeset -a run
run=("$@")
(( ${#run} )) || run=(/opt/agent-host/entrypoint.sh)

if [[ -z "${INFISICAL_CLIENT_ID:-}" ]]; then
  print -r -- "secrets: no INFISICAL_CLIENT_ID, using the environment as given"
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

typeset -a from_vault kept
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
  export "$key=$(jq -r .value <<<"$pair")"
  from_vault+=("$key")
done <<<"$pairs"

print -r -- "secrets: $environment $folder: ${#from_vault} from the vault${from_vault:+ (${(j:, :)from_vault})}"
(( ${#kept} )) && print -r -- "secrets: kept from the environment: ${(j:, :)kept}"

# Out of the loop's own environment. PID 1 (tini) still holds it in /proc/1/environ, readable by
# the same uid; accepted because the identity is a Viewer of a project that holds only this folder.
unset token vault pairs pair INFISICAL_CLIENT_SECRET INFISICAL_CLIENT_ID INFISICAL_TOKEN
exec "${run[@]}"

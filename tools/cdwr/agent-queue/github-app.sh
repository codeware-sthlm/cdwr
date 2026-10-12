#!/bin/zsh
# GitHub identity for a launched implement-only session: a GitHub App, never Håkan's own login.
# Håkan is in the `release` team, which bypasses main's rulesets; an app in no bypass list gets
# the branch rules from GitHub itself. Sourced by implement.sh; every function fails closed.
#   app_env <.env file>   reads AGENT_GITHUB_APP_ID, _INSTALLATION_ID and _KEY_PATH, nothing else
#   app_jwt               a 9-minute RS256 JWT for the app, signed with openssl
#   app_session           exchanges the JWT for an installation token on cdwr, then exports
#                         GH_TOKEN, an env-only git credential helper and the bot's commit identity
# AGENT_QUEUE_GITHUB_API replaces https://api.github.com in specs.

GITHUB_API="${AGENT_QUEUE_GITHUB_API:-https://api.github.com}"

# The three variables, read as plain KEY=VALUE lines: the file is never sourced or evaluated
app_env() {
  local file=$1 line key value
  [[ -r "$file" ]] || { print -ru2 -- "github app: $file not readable"; return 1; }
  for line in "${(@f)$(<"$file")}"; do
    [[ "$line" == AGENT_GITHUB_APP_(ID|INSTALLATION_ID|KEY_PATH)=* ]] || continue
    key="${line%%=*}"; value="${line#*=}"
    value="${${value#[\"\']}%[\"\']}"
    typeset -g "$key=$value"
  done
  [[ "${AGENT_GITHUB_APP_ID:-}" == <-> ]] || { print -ru2 -- "github app: AGENT_GITHUB_APP_ID missing or not a number"; return 1; }
  [[ "${AGENT_GITHUB_APP_INSTALLATION_ID:-}" == <-> ]] || { print -ru2 -- "github app: AGENT_GITHUB_APP_INSTALLATION_ID missing or not a number"; return 1; }
  [[ -n "${AGENT_GITHUB_APP_KEY_PATH:-}" && -r "${AGENT_GITHUB_APP_KEY_PATH/#\~/$HOME}" ]] ||
    { print -ru2 -- "github app: AGENT_GITHUB_APP_KEY_PATH missing or not readable"; return 1; }
  AGENT_GITHUB_APP_KEY_PATH="${AGENT_GITHUB_APP_KEY_PATH/#\~/$HOME}"
  [[ "$(stat -f '%Lp' "$AGENT_GITHUB_APP_KEY_PATH" 2>/dev/null)" == 600 ]] ||
    { print -ru2 -- "github app: $AGENT_GITHUB_APP_KEY_PATH must have mode 600"; return 1; }
}

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

# Issued a minute back for clock drift; GitHub allows at most 10 minutes
app_jwt() {
  local now header claims signing sig
  now="$(date +%s)"
  header="$(print -rn -- '{"alg":"RS256","typ":"JWT"}' | b64url)"
  claims="$(jq -cnj --argjson iat $(( now - 60 )) --argjson exp $(( now + 540 )) --arg iss "$AGENT_GITHUB_APP_ID" \
    '{iat: $iat, exp: $exp, iss: $iss}' | b64url)"
  signing="$header.$claims"
  sig="$(print -rn -- "$signing" | openssl dgst -sha256 -sign "$AGENT_GITHUB_APP_KEY_PATH" -binary | b64url)" || return 1
  [[ -n "$sig" ]] || return 1
  print -r -- "$signing.$sig"
}

# Exports the session's GitHub identity; returns non-zero, with the reason on stderr, otherwise
app_session() {
  setopt localoptions extendedglob
  local jwt resp token slug bot
  jwt="$(app_jwt)" || { print -ru2 -- "github app: could not sign the JWT"; return 1; }
  # The token reaches only cdwr, whatever else the app is installed on
  resp="$(curl -sS -m 20 -X POST \
    -H "Authorization: Bearer $jwt" -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -d '{"repositories":["cdwr"]}' \
    "$GITHUB_API/app/installations/$AGENT_GITHUB_APP_INSTALLATION_ID/access_tokens")" ||
    { print -ru2 -- "github app: token exchange failed"; return 1; }
  token="$(jq -r '.token // empty' <<<"$resp" 2>/dev/null)"
  [[ "$token" == ghs_[A-Za-z0-9_.-]## ]] ||
    { print -ru2 -- "github app: no installation token: $(jq -r '.message // "unexpected response"' <<<"$resp" 2>/dev/null)"; return 1; }
  slug="$(curl -sS -m 20 -H "Authorization: Bearer $jwt" -H 'Accept: application/vnd.github+json' \
    "$GITHUB_API/app" | jq -r '.slug // empty' 2>/dev/null)"
  [[ "$slug" == [a-z0-9-]## ]] || { print -ru2 -- "github app: could not read the app's slug"; return 1; }
  bot="$(curl -sS -m 20 -H "Authorization: Bearer $token" -H 'Accept: application/vnd.github+json' \
    "$GITHUB_API/users/$slug%5Bbot%5D" | jq -r '.id // empty' 2>/dev/null)"
  [[ "$bot" == <-> ]] || { print -ru2 -- "github app: could not read the bot user of $slug"; return 1; }

  # gh reads GH_TOKEN before its own keychain login
  export GH_TOKEN="$token" GITHUB_TOKEN="$token"
  # git: drop every configured helper, then answer from the env token only. GitHub over SSH
  # becomes HTTPS so Håkan's SSH key is never offered, and SSH itself is made to fail.
  export GIT_CONFIG_COUNT=4
  export GIT_CONFIG_KEY_0=credential.helper GIT_CONFIG_VALUE_0=''
  export GIT_CONFIG_KEY_1=credential.helper \
    GIT_CONFIG_VALUE_1='!f() { test "$1" = get || exit 0; echo username=x-access-token; echo "password=$GH_TOKEN"; }; f'
  export GIT_CONFIG_KEY_2=url.https://github.com/.insteadOf GIT_CONFIG_VALUE_2='git@github.com:'
  export GIT_CONFIG_KEY_3=url.https://github.com/.pushInsteadOf GIT_CONFIG_VALUE_3='git@github.com:'
  export GIT_SSH_COMMAND=false GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never
  export GIT_AUTHOR_NAME="${slug}[bot]" GIT_COMMITTER_NAME="${slug}[bot]"
  export GIT_AUTHOR_EMAIL="$bot+${slug}[bot]@users.noreply.github.com" GIT_COMMITTER_EMAIL="$bot+${slug}[bot]@users.noreply.github.com"
}

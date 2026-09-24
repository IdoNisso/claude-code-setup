#!/bin/sh
# PreToolUse hook for Bash: block commands that read secret files or print
# secret environment variables. Exit code 2 blocks the call and shows stderr
# to Claude.

cmd=$(jq -r '.tool_input.command // empty')
[ -n "$cmd" ] || exit 0

block() {
  echo "Blocked by block-secrets hook: $1. If this is needed, ask the user to run it themselves." >&2
  exit 2
}

matches() {
  printf '%s' "$cmd" | grep -qE "$1"
}

matches '(^|[^[:alnum:]_])\.env' && block "command references a .env file"
matches '\.ssh/|\.aws/|\.config/gh/|\.netrc|\.credentials\.json' && block "command references a credentials path"
matches 'gh[[:space:]]+auth[[:space:]]+token' && block "command prints a GitHub token"
matches '(echo|printf)[^|;&]*\$\{?[[:alnum:]_]*(TOKEN|SECRET|KEY|PASSWORD|PASSWD|CREDENTIAL|AUTH)' && block "command prints a secret-looking variable"

exit 0

#!/bin/sh
# Claude Code status line
input=$(cat)

cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd')
used=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
used_tokens=$(echo "$input" | jq -r '((.context_window.total_input_tokens // 0) + (.context_window.total_output_tokens // 0))')
model=$(echo "$input" | jq -r '.model.display_name // empty')
effort=$(echo "$input" | jq -r '.effort.level // empty')

# Shorten home directory to ~
home="$HOME"
short_cwd=$(echo "$cwd" | sed "s|^$home|~|")

# Git branch and line changes vs HEAD (skip optional locks)
branch=$(git -C "$cwd" -c gc.auto=0 symbolic-ref --short HEAD 2>/dev/null)

if [ -n "$branch" ]; then
  untracked=$(git -C "$cwd" -c gc.auto=0 ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ')

  # Branch is dirty if diff HEAD is non-empty or there are untracked files
  if git -C "$cwd" -c gc.auto=0 diff HEAD --quiet 2>/dev/null && [ "$untracked" -eq 0 ]; then
    branch_color="\033[32m"
  else
    branch_color="\033[33m"
  fi

  # Sum additions (col 1) and deletions (col 2) across all changes vs HEAD
  numstat=$(git -C "$cwd" diff --numstat HEAD 2>/dev/null)
  additions=$(echo "$numstat" | awk 'NF{s+=$1} END{print s+0}')
  deletions=$(echo "$numstat" | awk 'NF{s+=$2} END{print s+0}')

  if [ "$additions" -eq 0 ]; then add_color="\033[38;5;240m"; else add_color="\033[32m"; fi
  if [ "$deletions" -eq 0 ]; then del_color="\033[38;5;240m"; else del_color="\033[31m"; fi

  git_section=$(printf "${branch_color}%s\033[0m\033[38;5;240m | \033[0m${add_color}+%s\033[0m ${del_color}-%s\033[0m" \
    "$branch" "$additions" "$deletions")
else
  git_section=""
fi

# Context usage with color — always shown, defaults to 0
pct=$(printf '%.0f' "${used:-0}")
tokens_fmt=$(awk -v t="${used_tokens:-0}" 'BEGIN{
  if (t >= 1000000) printf "%.1fM", t/1000000;
  else if (t >= 1000) printf "%.1fk", t/1000;
  else printf "%d", t;
}')
if [ "$pct" -le 20 ]; then
  ctx_color="\033[1;32m"
elif [ "$pct" -le 60 ]; then
  ctx_color="\033[1;33m"
else
  ctx_color="\033[1;31m"
fi
ctx_section=$(printf "${ctx_color}%s%% (%s)\033[0m" "$pct" "$tokens_fmt")

# ── Quota segment: 5h + weekly usage from Anthropic OAuth usage API ───────────
# Renders from a cache file only (never blocks). When the cache is stale a
# detached background curl refreshes it for the next render. Strictly read-only
# on the credentials file — it never writes ~/.claude/.credentials.json.
usage_cache="$HOME/.claude/.usage-cache.json"
usage_cred="$HOME/.claude/.credentials.json"
usage_ttl=60
now=$(date +%s)

# Trigger a detached refresh when the cache is missing or older than the TTL.
cache_age=$((usage_ttl + 1))
if [ -f "$usage_cache" ]; then
  fetched_at=$(jq -r '.fetched_at // 0' "$usage_cache" 2>/dev/null)
  cache_age=$((now - ${fetched_at:-0}))
fi
if [ "$cache_age" -gt "$usage_ttl" ] && [ -f "$usage_cred" ]; then
  (
    token=$(jq -r '.claudeAiOauth.accessToken // empty' "$usage_cred" 2>/dev/null)
    [ -z "$token" ] && exit 0
    resp=$(curl -s --max-time 5 \
      -H "Authorization: Bearer $token" \
      -H "anthropic-beta: oauth-2025-04-20" \
      -H "Content-Type: application/json" \
      "https://api.anthropic.com/api/oauth/usage" 2>/dev/null)
    [ -z "$resp" ] && exit 0
    echo "$resp" | jq -e '.five_hour' >/dev/null 2>&1 || exit 0
    tmp="$usage_cache.$$"
    echo "$resp" | jq --argjson t "$(date +%s)" '{
      fetched_at: $t,
      five_pct: ((.five_hour.utilization // 0) | floor),
      five_reset: ((.five_hour.resets_at // "") | if . == "" then 0 else ((sub("\\..*"; "Z")) | (fromdateiso8601? // 0)) end),
      week_pct: ((.seven_day.utilization // 0) | floor),
      week_reset: ((.seven_day.resets_at // "") | if . == "" then 0 else ((sub("\\..*"; "Z")) | (fromdateiso8601? // 0)) end)
    }' > "$tmp" 2>/dev/null && mv "$tmp" "$usage_cache" || rm -f "$tmp"
  ) >/dev/null 2>&1 &
fi

# Format a reset countdown from an epoch target: "Nm" / "~Nh" / "~Nd".
quota_reset() {
  target=$1
  [ -z "$target" ] || [ "$target" -le 0 ] 2>/dev/null && { printf ""; return; }
  delta=$((target - now))
  [ "$delta" -le 0 ] && { printf ""; return; }
  if [ "$delta" -lt 3600 ]; then
    printf "%dm" $((delta / 60))
  elif [ "$delta" -lt 86400 ]; then
    printf "~%dh" $((delta / 3600))
  else
    printf "~%dd" $((delta / 86400))
  fi
}

# Pick a color by utilization: green <60, yellow 60-80, red >80.
quota_color() {
  p=$1
  if [ "$p" -gt 80 ]; then printf "\033[1;31m"
  elif [ "$p" -ge 60 ]; then printf "\033[1;33m"
  else printf "\033[1;32m"; fi
}

# Color the reset countdown by time remaining, using per-window thresholds
# (seconds): green >= green_min, yellow >= yellow_min, red below.
reset_color() {
  delta=$(( $1 - now )); yellow_min=$2; green_min=$3
  if [ "$delta" -ge "$green_min" ]; then printf "\033[1;32m"
  elif [ "$delta" -ge "$yellow_min" ]; then printf "\033[1;33m"
  else printf "\033[1;31m"; fi
}

# Build one "label pct% (reset)" cell. Label white; reset colored by time left
# against the window's yellow/green thresholds (seconds).
quota_cell() {
  label=$1; pct=$2; reset_epoch=$3; yellow_min=$4; green_min=$5
  col=$(quota_color "$pct")
  r=$(quota_reset "$reset_epoch")
  if [ -n "$r" ]; then
    rcol=$(reset_color "$reset_epoch" "$yellow_min" "$green_min")
    printf "\033[37m%s \033[0m${col}%s%%\033[0m ${rcol}(%s)\033[0m" "$label" "$pct" "$r"
  else
    printf "\033[37m%s \033[0m${col}%s%%\033[0m" "$label" "$pct"
  fi
}

if [ -f "$usage_cache" ] && jq -e '.five_pct' "$usage_cache" >/dev/null 2>&1; then
  five_pct=$(jq -r '.five_pct // 0' "$usage_cache" 2>/dev/null)
  five_reset=$(jq -r '.five_reset // 0' "$usage_cache" 2>/dev/null)
  week_pct=$(jq -r '.week_pct // 0' "$usage_cache" 2>/dev/null)
  week_reset=$(jq -r '.week_reset // 0' "$usage_cache" 2>/dev/null)
  quota_line=$(printf "%b\033[38;5;240m | \033[0m%b" \
    "$(quota_cell "5h" "$five_pct" "$five_reset" 3600 10800)" \
    "$(quota_cell "wk" "$week_pct" "$week_reset" 86400 259200)")
else
  quota_line="\033[37m5h \033[0m\033[38;5;240mN/A\033[0m\033[38;5;240m | \033[0m\033[37mwk \033[0m\033[38;5;240mN/A\033[0m"
fi

# Assemble output: cwd | [git | S | U | A |] ctx% | model
output=$(printf "\033[36m%s\033[0m" "$short_cwd")
if [ -n "$git_section" ]; then
  output=$(printf "%s\033[38;5;240m | \033[0m%b" "$output" "$git_section")
fi
if [ -n "$ctx_section" ]; then
  output=$(printf "%s\033[38;5;240m | \033[0m%b" "$output" "$ctx_section")
fi
if [ -n "$model" ]; then
  model_lower=$(echo "$model" | tr '[:upper:]' '[:lower:]')
  case "$model_lower" in
    *haiku*) model_color="\033[92m" ;;
    *sonnet*) model_color="\033[93m" ;;
    *opus*) model_color="\033[91m" ;;
    *fable*) model_color="\033[95m" ;;
    *) model_color="\033[38;5;240m" ;;
  esac
  output=$(printf "%s\033[38;5;240m | \033[0m${model_color}%s\033[0m" "$output" "$model")
  if [ -n "$effort" ]; then
    output=$(printf "%s\033[38;5;240m | \033[0m\033[37m%s\033[0m" "$output" "$effort")
  fi
fi
if [ -n "$quota_line" ]; then
  output=$(printf "%s\033[38;5;240m | \033[0m%b" "$output" "$quota_line")
fi

printf "%b" "$output"

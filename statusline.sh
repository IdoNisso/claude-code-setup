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
    *) model_color="\033[38;5;240m" ;;
  esac
  output=$(printf "%s\033[38;5;240m | \033[0m${model_color}%s\033[0m" "$output" "$model")
  if [ -n "$effort" ]; then
    output=$(printf "%s\033[38;5;240m | \033[0m\033[37m%s\033[0m" "$output" "$effort")
  fi
fi

printf "%b" "$output"

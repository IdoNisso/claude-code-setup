#!/bin/sh
# Sync tracked files between home/ in this repo and ~/.claude.
set -eu

repo_dir=$(cd "$(dirname "$0")" && pwd)
src="$repo_dir/home"
dest="$HOME/.claude"

usage() {
  cat >&2 <<EOF
usage: $0 [status|install|pull]
  status   show differences between home/ and $dest, and entries in
           $dest/{$(echo "$managed_dirs" | tr ' ' ,)} the repo does not track (default)
  install  copy home/ files into $dest
  pull     copy $dest files back into home/
EOF
  exit 1
}

tracked_files() {
  git -C "$repo_dir" ls-files home | sed 's|^home/||'
}

# Directories whose entries this repo owns. skills/synced is managed by
# Claude Code from the claude.ai account.
managed_dirs="hooks mods skills"

untracked_entries() {
  tracked=$(tracked_files)
  for dir in $managed_dirs; do
    for path in "$dest/$dir"/* "$dest/$dir"/.[!.]*; do
      [ -e "$path" ] || continue
      entry="$dir/${path##*/}"
      [ "$entry" = skills/synced ] && continue
      printf '%s\n' "$tracked" | grep -qE "^$entry(/|\$)" || echo "$entry"
    done
  done
}

case "${1:-status}" in
  status)
    drift=0
    for f in $(tracked_files); do
      if [ ! -e "$dest/$f" ]; then
        echo "not installed: $f"
        drift=1
      elif ! diff -u --label "repo/$f" --label "installed/$f" "$src/$f" "$dest/$f"; then
        drift=1
      fi
    done
    for entry in $(untracked_entries); do
      echo "not in repo: $entry"
      drift=1
    done
    [ "$drift" -eq 0 ] && echo "in sync"
    exit "$drift"
    ;;
  install)
    for f in $(tracked_files); do
      mkdir -p "$(dirname "$dest/$f")"
      cp -p "$src/$f" "$dest/$f"
      echo "installed $f"
    done
    ;;
  pull)
    for f in $(tracked_files); do
      if [ -e "$dest/$f" ]; then
        cp "$dest/$f" "$src/$f"
      else
        echo "skipped $f (not installed)"
      fi
    done
    git -C "$repo_dir" status --short home
    ;;
  *)
    usage
    ;;
esac

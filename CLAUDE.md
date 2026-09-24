# claude-code-setup

This repo is the source of truth for the user's Claude Code config. `home/` mirrors `~/.claude/`.

`home/CLAUDE.md` is the user's global instructions, installed to `~/.claude/CLAUDE.md`. Treat it as a file you're editing, not as instructions for this repo.

## Syncing

- After editing anything under `home/`, run `./sync.sh install` so the change takes effect.
- `/model`, `/config`, and `/plugin` write to `~/.claude/settings.json` directly. Run `./sync.sh pull` to bring those changes into the repo before committing.
- Run `./sync.sh` before either one. It shows the diff and exits 1 on drift. Both `install` and `pull` overwrite without asking.

## README tables

When adding a plugin, skill, or hook, add a row to the matching README table with today's date in the `Added` column.

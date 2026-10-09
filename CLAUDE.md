# claude-code-setup

This repo is the source of truth for the user's Claude Code config. `home/` mirrors `~/.claude/`.

`home/CLAUDE.md` is the user's global instructions, installed to `~/.claude/CLAUDE.md`. Treat it as a file you're editing, not as instructions for this repo.

## Syncing

- After editing anything under `home/`, run `./sync.sh install` so the change takes effect.
- `/model`, `/config`, and `/plugin` write to `~/.claude/settings.json` directly. Run `./sync.sh pull` to bring those changes into the repo before committing.
- Run `./sync.sh` before either one. It shows the diff and exits 1 on drift. Both `install` and `pull` overwrite without asking.

## Mods

Mods live in `home/mods/<name>/` and install to `~/.claude/mods/<name>/`. A new mod loads only after its folder is added to `CLAUDE_CODE_PLUGIN_DIRS` in `home/settings.json` (a `:`-separated list). Run `claude plugin validate` and `claude plugin test` on the mod folder before committing.

## Removing things

`sync.sh install` never deletes. After removing a hook, mod, or skill from `home/`, delete its installed copy from `~/.claude/` too. `./sync.sh` lists any leftovers as `not in repo:`.

## README tables

When adding a plugin, skill, hook, or mod, add a row to the matching README table with today's date in the `Added` column.

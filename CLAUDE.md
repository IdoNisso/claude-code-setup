# claude-code-setup

This repo is the source of truth for the user's Claude Code config. `home/` mirrors `~/.claude/`.

`home/CLAUDE.md` is the user's global instructions, installed to `~/.claude/CLAUDE.md`. Treat it as a file you're editing, not as instructions for this repo.

## Syncing

- After editing anything under `home/`, run `./sync.sh install` so the change takes effect.
- `/model`, `/config`, and `/plugin` write to `~/.claude/settings.json` directly. Run `./sync.sh pull` to bring those changes into the repo before committing.
- Run `./sync.sh` before either one. It shows the diff and exits 1 on drift. Both `install` and `pull` overwrite without asking.

## Mods

Mods live in `home/mods/<name>/` and install to `~/.claude/mods/<name>/`. A new mod loads only after its folder is added to `CLAUDE_CODE_PLUGIN_DIRS` in `home/settings.json` (a `:`-separated list). Run `claude plugin validate` and `claude plugin test` on the mod folder before committing.

`mods-pane` draws what the other mods publish in `$.state`: `block-secrets.blocks`, `commit-lint.blocks`, `sync-drift.drift` and `agent-links.links`, each declared in that mod's `types/index.d.ts`. To show a new mod there, have it publish its own state the same way, list it under `dependencies` in `mods-pane`'s `plugin.json`, and add a section in `mods-pane`'s `sections`.

## Removing things

After removing a hook, mod, or skill from `home/`, its installed copy stays in `~/.claude/`. `./sync.sh` lists it as `not in repo:`. `./sync.sh install` asks before deleting it, and keeps it when run without a terminal, which includes from the Bash tool. In that case, ask the user to run `./sync.sh install` themselves.

## README tables

When adding a plugin, skill, hook, or mod, add a row to the matching README table with today's date in the `Added` column.

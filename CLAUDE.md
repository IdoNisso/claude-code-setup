# claude-code-setup

This repo is the source of truth for the user's Claude Code config. `home/` mirrors `~/.claude/`.

`home/CLAUDE.md` is the user's global instructions, installed to `~/.claude/CLAUDE.md`. Treat it as a file you're editing, not as instructions for this repo.

## Syncing

- After editing anything under `home/`, run `./sync.sh install` so the change takes effect.
- `/model`, `/config`, and `/plugin` write to `~/.claude/settings.json` directly. Run `./sync.sh pull` to bring those changes into the repo before committing.
- Run `./sync.sh` before either one. It shows the diff and exits 1 on drift. Both `install` and `pull` overwrite without asking.

## Mods

Mods live in `home/mods/<name>/` and install to `~/.claude/mods/<name>/`. A new mod loads only after its folder is added to `CLAUDE_CODE_PLUGIN_DIRS` in `home/settings.json` (a `:`-separated list). Run `claude plugin validate` and `claude plugin test` on the mod folder before committing.

`mods-pane` draws what the other mods publish in `$.state`: `block-secrets.blocks`, `commit-lint.blocks`, `sync-drift.drift` and `agent-links.links`, each declared in that mod's `types/index.d.ts`. To show a new mod there, have it publish its own state the same way, list it under `dependencies` in `mods-pane`'s `plugin.json`, add a section in `mods-pane`'s `sections`, and add its name to `ModName` in `mods-pane`'s `types/index.d.ts` and to `MODS` in its module.

`/mods-pane reset` works through `mods-pane.resetRequest`, `{ mods, at }`: only a mod can write its own state, so each mod hooks `state.set` on that key, calls `next`, and clears its own state when its name is in `mods`. A new mod should do the same. To type that hook, import `ResetRequest` from `../../mods-pane/types`; listing `mods-pane` under `dependencies` would be a cycle, which the engine refuses.

A pane entry with a `dismissId` gets a `×` button that sets `mods-pane.dismissRequest`, `{ mod, entry, at }`, the same way. The owning mod hooks that key and drops the entry whose id is `entry` when `mod` is its name. `agent-links` does this with the peer name as the id.

## Removing things

After removing a hook, mod, or skill from `home/`, its installed copy stays in `~/.claude/`. `./sync.sh` lists it as `not in repo:`. `./sync.sh install` asks before deleting it, and keeps it when run without a terminal, which includes from the Bash tool. In that case, ask the user to run `./sync.sh install` themselves.

## README tables

When adding a plugin, skill, hook, or mod, add a row to the matching README table with today's date in the `Added` column.

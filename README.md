# Claude Code Setup

Personal Claude Code configuration: global instructions, settings, skills, mods, and a custom statusline.

## Files

`home/` mirrors `~/.claude/`: each tracked file at `home/<path>` installs to `~/.claude/<path>`.

| File | Purpose |
|------|---------|
| `home/CLAUDE.md` | Global instructions (language, style, git conventions) |
| `home/settings.json` | Claude Code settings (model, permissions, plugins, statusline) |
| `home/statusline.sh` | Custom statusline script showing cwd, git branch/changes, context %, model, effort |
| `home/skills/<name>/SKILL.md` | User-scope skills |
| `home/mods/<name>/` | Mods (hooks-module plugins) loaded via `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json` |
| `sync.sh` | Compares and copies files between `home/` and `~/.claude/` |
| `CLAUDE.md` | Instructions for working on this repo |

## Installation

Prerequisites:

- Claude Code with mod support (early access; verified on 2.1.295)
- `jq`, `git`, and `curl` on `PATH` for the statusline

```bash
./sync.sh install   # copy home/ into ~/.claude/
claude              # log in on first run
```

Start a new session after installing so settings and mods load. Enabled plugins are fetched from their marketplace on startup.

`sync.sh` always targets `~/.claude/`. `settings.json` and `statusline.sh` refer to that path directly, so `CLAUDE_CONFIG_DIR` is not supported.

## Keeping in sync

`/model`, `/config`, and `/plugin` write to `~/.claude/settings.json` directly, so the installed copy drifts from the repo over time.

```bash
./sync.sh           # show a diff for every file that differs (exit 1 on drift)
./sync.sh pull      # copy installed files back into home/, then review and commit
./sync.sh install   # overwrite installed files with the repo versions
```

Both `pull` and `install` overwrite without asking, so run `./sync.sh` first to see what will change.

Entries in `~/.claude/hooks`, `~/.claude/mods`, and `~/.claude/skills` that the repo does not track are usually left over from a hook, mod, or skill that was removed from the repo. `./sync.sh` lists them as `not in repo:`. After copying, `./sync.sh install` lists them again and asks whether to delete them (default: keep). When stdin is not a terminal it keeps them without asking. To keep one for good, add it to `home/`. `~/.claude/skills/synced` is managed by Claude Code and is ignored.

## Plugins

`settings.json` enables plugins via `enabledPlugins`. Currently:

| Plugin | Marketplace | Purpose | Added |
|--------|-------------|---------|-------|
| `mattpocock-skills` | `claude-plugins-official` | Engineering/productivity skills (TDD, code review, diagnosing bugs, domain modeling, …) | 2026-08-06 |

Claude Code fetches enabled plugins from the marketplace on startup, so installing `settings.json` is enough on a new machine. To add or remove one, use `/plugin`, then `./sync.sh pull` and commit.

## Skills (user-scope)

Files in `home/skills/` are installed to `~/.claude/skills/` and apply globally across all projects.

| Skill | Source | Purpose | Added |
|-------|--------|---------|-------|
| `unslop` | [cursor/plugins](https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md) | Remove AI writing patterns and add human voice | 2026-08-23 |

## Mods

Mods are hooks-module plugins in `home/mods/<name>/`. `settings.json` loads each one by listing its installed folder (`~/.claude/mods/<name>`) in `CLAUDE_CODE_PLUGIN_DIRS`, a `:`-separated list. Add any new mod's folder there too.

| Mod | Event | Purpose | Added |
|-----|-------|---------|-------|
| `block-secrets` | `tool.call` (Bash, Read, Edit, Write, NotebookEdit), `state.set` | Blocks commands that reference `.env` files or credential paths, run `gh auth token`, or `echo`/`printf` variables named like `*TOKEN*`, `*SECRET*`, `*KEY*`, `*PASSWORD*`, `*AUTH*`. Blocks file tools on the same paths. Shows a toast when it blocks a call and records it for `mods-pane`; `/mods-pane reset secrets` clears the record. | 2026-10-09 |
| `commit-lint` | `tool.call` (Bash), `state.set` | Blocks `git commit` when the subject breaks the conventional format in `home/CLAUDE.md`: unknown type, over 50 characters, trailing period, or a first word ending in `-ed`/`-ing`. Reads the subject from `-m`/`--message` or a heredoc; commits without a message (editor, `--no-edit`) pass. Shows a toast when it blocks and records the commit for `mods-pane`; `/mods-pane reset commit` clears the record. | 2026-10-09 |
| `sync-drift` | `session.start`, `turn.complete`, `state.set` | Runs `./sync.sh status` at session start, after every turn, and every 5 minutes, and publishes a summary like `2 changed, 1 not in repo` for `mods-pane`, which shows it in a band above the prompt until the drift is resolved. The repo path is the `repoPath` option (default `~/repos/IdoNisso/claude-code-setup`), changeable in `/config`. `/mods-pane reset drift` runs the check again from scratch. | 2026-10-09 |
| `agent-links` | `session.start`, `session.end`, `session.send`, `session.receive`, `tool.call` (SendMessage), `turn.start`, `turn.complete`, `state.set` | Tracks the peer sessions this one messages and who is waiting on whom: awaiting their reply, awaiting ours, watching for idle (`notify_when_idle`), or settled. Every session writes a card (name, repo, busy/idle, last message sent to each peer and whether it was a reply) to `~/.claude/agent-links/<session id>.json` every 15 seconds, and reads its peers' cards to see their side. A peer whose card stops updating for a minute shows as gone, and one silent for a day is dropped. Publishes the links for `mods-pane`, which turns the section yellow and shows a toast when a reply is more than 3 minutes overdue. Assumes every session on the machine runs this mod. `/mods-pane reset links` forgets every message and watch up to now. The `×` beside a link in the pane forgets that one peer's messages and watch up to now, which clears a gone link; the link comes back with the next message, and the dismissal survives a restart. | 2026-10-09 |
| `mods-pane` | `session.start`, `command.run`, `ui.close`, `ui.render` (Pane, AbovePrompt) | A `Mods` pane listing what the four mods above did: each mod's state and its latest events, separated by rules, long lines wrapped, with a `Hide` button at the bottom right and a `×` beside each agent-links entry that dismisses it. Opens by itself only in fullscreen (`CLAUDE_CODE_NO_FLICKER=1`), where it docks beside the transcript; on the main screen it waits for `/mods-pane`. `/mods-pane` toggles it, `/mods-pane show\|hide` sets it, and the pane's `Hide` button (`h`) or close mark hides it. `/mods-pane remove\|add <mod>...` drops or restores sections, `order <mod>...` puts mods first (none restores sync-drift, block-secrets, commit-lint, agent-links), `recent [n]` shows or sets the events per section (default 3), `reset <mod>...\|all` asks mods to clear their own state, `list` prints every mod's status, and `help` the usage. A mod can be named by half its name, like `secrets`. A right-aligned band above the prompt shows any sync drift and, while the pane is hidden, says so and counts events since, with a button that shows it again. Remembers hidden or shown, removed sections, order and events per section across sessions. | 2026-10-09 |

Check a mod with `claude plugin validate home/mods/<name>`, run its tests with `claude plugin test home/mods/<name>`, and type-check it with `npx -p typescript tsc -p ~/.claude/mods/<name>`. The type-check runs against the installed copy because Claude Code writes the mod's types into `~/.claude/mods/<name>/.claude-plugin/types/` when it loads the mod, so start a session after `./sync.sh install` first.

## Secrets protection

`settings.json` denies reading or editing `.env` files and reading common credential paths (`~/.ssh`, `~/.aws`, `~/.config/gh/hosts.yml`, `~/.netrc`, `~/.claude/.credentials.json`), and denies commands that dump the whole environment (`env`, `printenv`, `set`, `export -p`).

Bash deny rules only match command prefixes, so `grep . .env` or `python -c` would slip past them. The [`block-secrets` mod](#mods) covers those cases by inspecting the full command. It is a pattern match, not a sandbox, so a determined command can still get around it.

## Statusline

`home/statusline.sh` reads Claude Code's status JSON from stdin and renders a single line:

```
<cwd> | <branch> | +<additions> -<deletions> | <context%> (<tokens>) | <model> | <effort> | 5h <pct>% (<reset>) | wk <pct>% (<reset>)
```

- **cwd**: working directory, with `$HOME` shortened to `~`
- **git**: branch name (green when clean, yellow when dirty) plus added/deleted line counts vs `HEAD`
- **context**: percent of context window used (green ≤20%, yellow ≤60%, red above) with a humanized token count
- **model**: display name, colored by family (Haiku/Sonnet/Opus/Fable)
- **effort**: current effort level, when set
- **5h / wk**: 5-hour and weekly account usage quotas. The `5h`/`wk` labels are white; the utilization percent is colored by level (green <60%, yellow 60–80%, red >80%); the reset countdown (`Nm` / `~Nh` / `~Nd`) is colored by time remaining (5h window: green ≥3h, yellow ≥1h, red below; weekly: green ≥3d, yellow ≥1d, red below).

The script is POSIX shell and requires `jq`, `git`, and `curl` on `PATH`.

The git and effort sections are omitted when not applicable (e.g. outside a repo, or no effort level set).

The quota data comes from Anthropic's OAuth usage API, using the token in `~/.claude/.credentials.json` (read-only — the script never writes credentials). Results are cached in `~/.claude/.usage-cache.json` for 60s. The statusline always renders instantly from the cache; when the cache is stale it triggers a detached background refresh for the next render, so the network is never on the render path. A cold cache shows `5h N/A | wk N/A` until the first fetch completes.

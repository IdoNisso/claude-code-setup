# Claude Code Setup

Personal Claude Code configuration: global instructions, settings, and a custom statusline.

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

```bash
./sync.sh install   # copy home/ into ~/.claude/
```

`sync.sh` always targets `~/.claude/`. `settings.json` and `statusline.sh` refer to that path directly, so `CLAUDE_CONFIG_DIR` is not supported.

## Keeping in sync

`/model`, `/config`, and `/plugin` write to `~/.claude/settings.json` directly, so the installed copy drifts from the repo over time.

```bash
./sync.sh           # show a diff for every file that differs (exit 1 on drift)
./sync.sh pull      # copy installed files back into home/, then review and commit
./sync.sh install   # overwrite installed files with the repo versions
```

Both `pull` and `install` overwrite without asking, so run `./sync.sh` first to see what will change.

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

## Secrets protection

`settings.json` denies reading or editing `.env` files and reading common credential paths (`~/.ssh`, `~/.aws`, `~/.config/gh/hosts.yml`, `~/.netrc`, `~/.claude/.credentials.json`), and denies commands that dump the whole environment (`env`, `printenv`, `set`, `export -p`).

Bash deny rules only match command prefixes, so `grep . .env` or `python -c` would slip past them. The `block-secrets` mod covers those cases by inspecting the full command.

| Mod | Event | Purpose | Added |
|-----|-------|---------|-------|
| `block-secrets` | `tool.call` (Bash, Read, Edit, Write, NotebookEdit) | Blocks commands that reference `.env` files or credential paths, run `gh auth token`, or `echo`/`printf` variables named like `*TOKEN*`, `*SECRET*`, `*KEY*`, `*PASSWORD*`, `*AUTH*`. Blocks file tools on the same paths. Shows a toast when it blocks a call. | 2026-10-09 |

The mod is a pattern match, not a sandbox, so a determined command can still get around it. Run its tests with `claude plugin test home/mods/block-secrets`.

`settings.json` loads it by listing `~/.claude/mods/block-secrets` in `CLAUDE_CODE_PLUGIN_DIRS`, a `:`-separated list. Add any new mod's folder there too.

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

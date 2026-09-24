# Claude Code Setup

Personal Claude Code configuration: global instructions, settings, and a custom statusline.

## Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Global instructions (language, style, git conventions) |
| `settings.json` | Claude Code settings (model, plugins, statusline) |
| `statusline.sh` | Custom statusline script showing cwd, git branch/changes, context %, model, effort |
| `skills/<name>/SKILL.md` | User-scope skills installed under `~/.claude/skills/` |

## Installation

All files live under `~/.claude/`:

```bash
# Global instructions
cp CLAUDE.md ~/.claude/CLAUDE.md

# Settings
cp settings.json ~/.claude/settings.json

# Statusline
cp statusline.sh ~/.claude/statusline.sh
chmod +x ~/.claude/statusline.sh

# Skills (user-scope)
cp -r skills/ ~/.claude/skills/
```

The statusline is a POSIX shell script and requires `jq`, `git`, and `curl` on `PATH`.

## Plugins

`settings.json` enables plugins via `enabledPlugins`. Currently:

| Plugin | Marketplace | Purpose | Added |
|--------|-------------|---------|-------|
| `mattpocock-skills` | `claude-plugins-official` | Engineering/productivity skills (TDD, code review, diagnosing bugs, domain modeling, …) | 2026-08-06 |

Claude Code fetches enabled plugins from the marketplace on startup, so copying `settings.json` is enough on a new machine. To add or remove one, use `/plugin` and mirror the resulting `enabledPlugins` block back into this repo.

## Skills (user-scope)

Files in `skills/` are installed to `~/.claude/skills/` and apply globally across all projects.

| Skill | Source | Purpose | Added |
|-------|--------|---------|-------|
| `unslop` | [cursor/plugins](https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md) | Remove AI writing patterns and add human voice | 2026-08-23 |

## Statusline

`statusline.sh` reads Claude Code's status JSON from stdin and renders a single line:

```
<cwd> | <branch> | +<additions> -<deletions> | <context%> (<tokens>) | <model> | <effort> | 5h <pct>% (<reset>) | wk <pct>% (<reset>)
```

- **cwd**: working directory, with `$HOME` shortened to `~`
- **git**: branch name (green when clean, yellow when dirty) plus added/deleted line counts vs `HEAD`
- **context**: percent of context window used (green ≤20%, yellow ≤60%, red above) with a humanized token count
- **model**: display name, colored by family (Haiku/Sonnet/Opus/Fable)
- **effort**: current effort level, when set
- **5h / wk**: 5-hour and weekly account usage quotas. The `5h`/`wk` labels are white; the utilization percent is colored by level (green <60%, yellow 60–80%, red >80%); the reset countdown (`Nm` / `~Nh` / `~Nd`) is colored by time remaining (5h window: green ≥3h, yellow ≥1h, red below; weekly: green ≥3d, yellow ≥1d, red below).

The git and effort sections are omitted when not applicable (e.g. outside a repo, or no effort level set).

The quota data comes from Anthropic's OAuth usage API, using the token in `~/.claude/.credentials.json` (read-only — the script never writes credentials). Results are cached in `~/.claude/.usage-cache.json` for 60s. The statusline always renders instantly from the cache; when the cache is stale it triggers a detached background refresh for the next render, so the network is never on the render path. A cold cache shows `5h N/A | wk N/A` until the first fetch completes.

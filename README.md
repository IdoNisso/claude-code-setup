# Claude Code Setup

Personal Claude Code configuration: global instructions, settings, and a custom statusline.

## Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Global instructions (language, style, git conventions) |
| `settings.json` | Claude Code settings (model, plugins, statusline) |
| `statusline.sh` | Custom statusline script showing cwd, git branch/changes, context %, model, effort |

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
```

The statusline is a POSIX shell script and requires `jq`, `git`, and `curl` on `PATH`.

## Statusline

`statusline.sh` reads Claude Code's status JSON from stdin and renders a single line:

```
<cwd> | <branch> | +<additions> -<deletions> | <context%> (<tokens>) | <model> | <effort> | 5h <pct>% (<reset>) | wk <pct>% (<reset>)
```

- **cwd**: working directory, with `$HOME` shortened to `~`
- **git**: branch name (green when clean, yellow when dirty) plus added/deleted line counts vs `HEAD`
- **context**: percent of context window used (green ≤20%, yellow ≤60%, red above) with a humanized token count
- **model**: display name, colored by family (Haiku/Sonnet/Opus)
- **effort**: current effort level, when set
- **5h / wk**: 5-hour and weekly account usage quotas. The `5h`/`wk` labels are orange; the utilization percent is colored by level (green <60%, yellow 60–80%, red >80%); the reset countdown (`Nm` / `~Nh` / `~Nd`) is colored by time remaining (green >1h, yellow >15m, red below).

The git and effort sections are omitted when not applicable (e.g. outside a repo, or no effort level set).

The quota data comes from Anthropic's OAuth usage API, using the token in `~/.claude/.credentials.json` (read-only — the script never writes credentials). Results are cached in `~/.claude/.usage-cache.json` for 60s. The statusline always renders instantly from the cache; when the cache is stale it triggers a detached background refresh for the next render, so the network is never on the render path. A cold cache shows `5h N/A | wk N/A` until the first fetch completes.

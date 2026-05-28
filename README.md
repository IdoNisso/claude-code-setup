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

The statusline is a POSIX shell script and requires `jq` and `git` on `PATH`.

## Statusline

`statusline.sh` reads Claude Code's status JSON from stdin and renders a single line:

```
<cwd> | <branch> | +<additions> -<deletions> | <context%> (<tokens>) | <model> | <effort>
```

- **cwd**: working directory, with `$HOME` shortened to `~`
- **git**: branch name (green when clean, yellow when dirty) plus added/deleted line counts vs `HEAD`
- **context**: percent of context window used (green ≤20%, yellow ≤60%, red above) with a humanized token count
- **model**: display name, colored by family (Haiku/Sonnet/Opus)
- **effort**: current effort level, when set

The git and effort sections are omitted when not applicable (e.g. outside a repo, or no effort level set).

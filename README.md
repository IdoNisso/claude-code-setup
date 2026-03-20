# Claude Code Setup

Personal Claude Code configuration: global instructions, settings, and a custom HUD statusline.

## Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Global instructions (language, style, git conventions) |
| `settings.json` | Claude Code settings (model, plugins, statusline) |
| `hud/metricc-cc-statusbar.mjs` | Custom statusline script showing rate limits, context %, agents, session info |
| `hud/config.jsonc` | HUD column toggles and layout |

## Installation

All files live under `~/.claude/`:

```bash
# Global instructions
cp CLAUDE.md ~/.claude/CLAUDE.md

# Settings
cp settings.json ~/.claude/settings.json

# HUD statusline
mkdir -p ~/.claude/hud
cp hud/metricc-cc-statusbar.mjs ~/.claude/hud/
cp hud/config.jsonc ~/.claude/hud/
```

The statusline requires Node.js (uses only built-in modules, no `npm install` needed).

## HUD Configuration

Edit `~/.claude/hud/config.jsonc` to toggle columns on/off and switch between `"vertical"` and `"horizontal"` layout. Available columns:

- **Standard** (on by default): `5h Usage`, `7d Usage`, `Context`, `Model`, `Version`
- **Session** (off by default): `Session`, `Changes`, `Directory`, `Cost`
- **Advanced** (off by default): `Tokens`, `Output Tokens`, `Cache`, `API Time`, `5h Reset`, `7d Reset`

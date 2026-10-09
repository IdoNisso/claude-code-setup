# PROTOTYPE: mods UI (throwaway)

Question: what should TUI components for this repo's mods look like?

Variants tried, switched with `/mods-proto pane|band|status|report`:
a sidebar pane, a band above the prompt, one status line entry, and an
on-demand markdown table.

Verdict (2026-10-09): the pane, with hide/show.

- `/mods-pane [true|false]` shows or hides it; no argument toggles.
- While hidden, a right-aligned band above the prompt says so and counts
  events that arrived since, with a button that shows the pane.
- Hidden or shown is remembered across sessions.
- sync-drift keeps its toast and drops its status line entry.

Learned along the way: switching to agent view forks the session into a
new process, which does not load a session's dev-mods folder.

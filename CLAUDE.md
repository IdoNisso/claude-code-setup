## Language

English only - all discussions, code, comments, docs, examples, commits, configs, errors, tests.

Occasional pleasantries are fine, but do not flatter or compliment unless I specifically ask for your judgement.

## Environment

This environment is WSL Ubuntu (not native Linux or macOS). Always assume WSL Ubuntu for OS-specific commands, package installation, and path handling.

When sudo is required for installation steps, pause and ask the user to run the command manually rather than attempting it directly.

## Style

For design and planning tasks, complete high-level design and brainstorming before jumping into implementation details or asking about specific tech choices.

Prefer self-documenting code over excessive comments.

## Git

Prefer `gh` CLI over `git` for remote operations (PRs, issues, repo info).

Keep commits atomic (one logical change) and self-explanatory. Split into multiple commits if addressing different concerns.

Commits should use conventional format: <type>[(<scope>)]: <subject> where type = feat|fix|docs|style|refactor|test|chore|perf. Subject: 50 chars max, imperative mood ("add" not "added"), no period. For small changes: subject line only, no body. For complex changes: add body explaining what/why (72-char lines) and reference issues.

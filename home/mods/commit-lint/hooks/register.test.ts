import { describe, expect, test } from 'claude-code/testing'

import type { On } from 'claude-code'

const toasts: string[] = []

const stubEngine = (on: On) => {
  toasts.length = 0
  on('tool.call', () => ({ result: 'ran' }) as never)
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined } as never
  })
}

const heredocCommit = (message: string) =>
  `git commit -m "$(cat <<'EOF'\n${message}\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nEOF\n)"`

describe('blocked commits', () => {
  const blocked = [
    ['git commit -m "Add the thing"', 'must start with'],
    ['git commit -m "feature: add the thing"', 'must start with'],
    ['git commit -m "feat:add the thing"', 'must start with'],
    ['git commit -m "feat: add the thing."', 'ends with a period'],
    ['git commit -m "fix: added a null check"', '"added"'],
    ["git commit -m 'refactor(sync): renaming helpers'", '"renaming"'],
    ['git commit -am "docs: describe every single option the sync script accepts"', 'max 50'],
    ['git -C repo commit --message="chore: bumped deps"', '"bumped"'],
    ['git add . && git commit -m "Fix bug" && git push', 'must start with'],
    [heredocCommit('feat: added mods'), '"added"'],
  ] as const

  for (const [command, reason] of blocked) {
    test(`blocks: ${command.split('\n')[0]}`, async ($, on) => {
      stubEngine(on)
      const result = await $.tool.call({ tool: 'Bash', command })
      expect(result.deny).toContain('Blocked by commit-lint')
      expect(result.deny).toContain(reason)
      expect(toasts).toEqual([expect.stringContaining('commit-lint')])
    })
  }
})

describe('allowed commands', () => {
  const allowed = [
    'git commit -m "feat: add commit-lint mod"',
    'git commit -m "fix(sync): handle missing dirs"',
    'git commit -m "feat!: drop CLAUDE_CONFIG_DIR support"',
    'git commit -m "perf: embed the cache"',
    'git commit -m "docs: add install steps" -m "Longer body. With periods."',
    heredocCommit('refactor: replace secret-blocking hook with a mod'),
    'git commit --amend --no-edit',
    'git commit',
    'git log --oneline',
    'git status',
  ]

  for (const command of allowed) {
    test(`allows: ${command.split('\n')[0]}`, async ($, on) => {
      stubEngine(on)
      const result = await $.tool.call({ tool: 'Bash', command })
      expect(result.result).toBe('ran')
      expect(toasts).toEqual([])
    })
  }
})

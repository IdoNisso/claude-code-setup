import { describe, expect, mock, test } from 'claude-code/testing'

import type { On } from 'claude-code'
import type { Engine, Plugin } from 'claude-code/testing'

const toasts: string[] = []

const MODS_PANE: Plugin = {
  name: 'mods-pane',
  register: on => {
    on('command.run', { command: 'reset' }, async ($, e) => {
      await $.state.set({ plugin: 'mods-pane', key: 'resetRequest' } as never, { mods: e.args.split(' '), at: 1 } as never)
      return { text: '' }
    })
  },
}

const requestReset = ($: Engine, mods: string) =>
  $.command.run({ command: 'reset', args: mods, origin: { kind: 'composer' }, presentation: {} } as never)

const stubEngine = (on: On) => {
  toasts.length = 0
  mock.clock(on)
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

describe('published blocks', () => {
  test('records each blocked commit for other mods to read', async ($, on) => {
    stubEngine(on)
    let published: { subject: string; problems: string[] }[] = []
    on('state.set', { plugin: 'commit-lint', key: 'blocks' }, (_$, e, next) => {
      published = e.value
      return next(e)
    })
    await $.tool.call({ tool: 'Bash', command: 'git commit -m "fix: added a check."' })
    await $.tool.call({ tool: 'Bash', command: 'git commit -m "fix: add a check"' })
    expect(published).toHaveLength(1)
    expect(published[0]?.subject).toBe('fix: added a check.')
    expect(published[0]?.problems).toHaveLength(2)
  })

  test('clears its blocks when the mods pane asks', { plugins: [MODS_PANE] }, async ($, on) => {
    stubEngine(on)
    let published: unknown[] = []
    on('state.set', { plugin: 'commit-lint', key: 'blocks' }, (_$, e, next) => {
      published = e.value
      return next(e)
    })
    await $.tool.call({ tool: 'Bash', command: 'git commit -m "fix: added a check."' })
    await requestReset($, 'block-secrets')
    expect(published).toHaveLength(1)
    await requestReset($, 'commit-lint')
    expect(published).toEqual([])
  })
})

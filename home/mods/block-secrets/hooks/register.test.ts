import { describe, expect, mock, test } from 'claude-code/testing'

import type { On } from 'claude-code'

const toasts: string[] = []

const stubEngine = (on: On) => {
  toasts.length = 0
  mock.clock(on)
  on('tool.call', () => ({ result: 'ran' }) as never)
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined } as never
  })
}

describe('Bash', () => {
  const blocked = [
    ['grep . .env', '.env file'],
    ['python -c "open(\'app/.env.local\').read()"', '.env file'],
    ['cat ~/.ssh/id_ed25519', 'credentials path'],
    ['sed -n 1p ~/.aws/credentials', 'credentials path'],
    ['gh  auth token', 'GitHub token'],
    ['echo "$GITHUB_TOKEN"', 'secret-looking variable'],
    ['printf %s ${API_KEY}', 'secret-looking variable'],
  ] as const

  for (const [command, reason] of blocked) {
    test(`blocks: ${command}`, async ($, on) => {
      stubEngine(on)
      const result = await $.tool.call({ tool: 'Bash', command })
      expect(result.deny).toContain(reason)
      expect(toasts).toEqual([expect.stringContaining(reason)])
    })
  }

  const allowed = ['ls -la', 'git status', 'echo $HOME', 'cat environment.ts', 'gh auth status']

  for (const command of allowed) {
    test(`allows: ${command}`, async ($, on) => {
      stubEngine(on)
      const result = await $.tool.call({ tool: 'Bash', command })
      expect(result.result).toBe('ran')
    })
  }
})

describe('file tools', () => {
  test('blocks Read of a .env file', async ($, on) => {
    stubEngine(on)
    const result = await $.tool.call({ tool: 'Read', file_path: '/repo/.env' })
    expect(result.deny).toContain('Blocked by block-secrets')
  })

  test('blocks Write to the Claude credentials file', async ($, on) => {
    stubEngine(on)
    const result = await $.tool.call({
      tool: 'Write',
      file_path: '/home/u/.claude/.credentials.json',
      content: '{}',
    })
    expect(result.deny).toContain('Blocked by block-secrets')
  })

  test('blocks NotebookEdit under ~/.aws', async ($, on) => {
    stubEngine(on)
    const result = await $.tool.call({
      tool: 'NotebookEdit',
      notebook_path: '/home/u/.aws/notes.ipynb',
      new_source: '',
    })
    expect(result.deny).toContain('Blocked by block-secrets')
  })

  test('allows Read of an ordinary file', async ($, on) => {
    stubEngine(on)
    const result = await $.tool.call({ tool: 'Read', file_path: '/repo/src/environment.ts' })
    expect(result.result).toBe('ran')
  })
})

describe('published blocks', () => {
  test('records each block for other mods to read', async ($, on) => {
    stubEngine(on)
    let published: { tool: string; reason: string }[] = []
    on('state.set', { plugin: 'block-secrets', key: 'blocks' }, (_$, e, next) => {
      published = e.value
      return next(e)
    })
    await $.tool.call({ tool: 'Bash', command: 'gh auth token' })
    await $.tool.call({ tool: 'Read', file_path: '/repo/.env' })
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    expect(published.map(one => [one.tool, one.reason])).toEqual([
      ['Bash', 'prints a GitHub token'],
      ['Read', 'references a .env file'],
    ])
  })
})

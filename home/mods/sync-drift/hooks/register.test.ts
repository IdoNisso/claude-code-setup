import { expect, mock, test } from 'claude-code/testing'

import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const IN_SYNC = { exitCode: 0, stdout: 'in sync\n' }

const DRIFTED = {
  exitCode: 1,
  stdout: [
    '--- repo/settings.json',
    '+++ installed/settings.json',
    '@@ -1 +1 @@',
    '--- repo/CLAUDE.md',
    '+++ installed/CLAUDE.md',
    'not in repo: mods/old-mod',
  ].join('\n'),
}

type RunResult = { exitCode: number; stdout: string }

const setup = (on: On, results: RunResult[]) => {
  const runs: string[][] = []
  const statuses: (string | undefined)[] = []
  const toasts: string[] = []
  mock.env(on, { HOME: '/home/u' })
  const clock = mock.clock(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('process.run', (_$, e) => {
    runs.push([...e.argv])
    const next = (results.length > 1 ? results.shift() : results[0]) ?? IN_SYNC
    return { value: { ...next, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.status', (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return { clock, runs, statuses, toasts }
}

const startSession = ($: Engine) =>
  $.session.start({ cwd: '/home/u', surface: 'terminal', isInteractive: true } as never)

test('runs sync.sh from the configured repo on session start', async ($, on) => {
  const { clock, runs, statuses, toasts } = setup(on, [IN_SYNC])
  await startSession($)
  await clock.settle()
  expect(runs).toEqual([['sh', '/home/u/repos/IdoNisso/claude-code-setup/sync.sh', 'status']])
  expect(statuses).toEqual([undefined])
  expect(toasts).toEqual([])
})

test('shows a drift summary and toasts once', async ($, on) => {
  const { clock, statuses, toasts } = setup(on, [DRIFTED])
  await startSession($)
  await clock.settle()
  await clock.advance(5 * 60_000)
  expect(statuses).toEqual([
    '~/.claude drift: 2 changed, 1 not in repo',
    '~/.claude drift: 2 changed, 1 not in repo',
  ])
  expect(toasts).toHaveLength(1)
})

test('clears the status once back in sync', async ($, on) => {
  const { clock, statuses } = setup(on, [DRIFTED, IN_SYNC])
  await startSession($)
  await clock.settle()
  await clock.advance(5 * 60_000)
  expect(statuses).toEqual(['~/.claude drift: 2 changed, 1 not in repo', undefined])
})

test('says when sync.sh cannot run', async ($, on) => {
  const { clock, statuses } = setup(on, [{ exitCode: 127, stdout: '' }])
  await startSession($)
  await clock.settle()
  expect(statuses).toEqual(['sync-drift: cannot run /home/u/repos/IdoNisso/claude-code-setup/sync.sh'])
})

test('uses an absolute repo path as given', { options: { repoPath: '/srv/setup' } }, async ($, on) => {
  const { clock, runs } = setup(on, [IN_SYNC])
  await startSession($)
  await clock.settle()
  expect(runs).toEqual([['sh', '/srv/setup/sync.sh', 'status']])
})

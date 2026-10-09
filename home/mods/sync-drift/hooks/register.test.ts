import { expect, mock, test } from 'claude-code/testing'

import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import type { Drift } from '../types'

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
  const published: (Drift | null)[] = []
  const toasts: string[] = []
  mock.env(on, { HOME: '/home/u' })
  const clock = mock.clock(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('process.run', (_$, e) => {
    runs.push([...e.argv])
    const next = (results.length > 1 ? results.shift() : results[0]) ?? IN_SYNC
    return { value: { ...next, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('state.set', { plugin: 'sync-drift', key: 'drift' }, (_$, e, next) => {
    published.push(e.value)
    return next(e)
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return { clock, runs, published, toasts }
}

const startSession = ($: Engine) =>
  $.session.start({ cwd: '/home/u', surface: 'terminal', isInteractive: true } as never)

test('runs sync.sh from the configured repo on session start', async ($, on) => {
  const { clock, runs, published, toasts } = setup(on, [IN_SYNC])
  await startSession($)
  await clock.settle()
  expect(runs).toEqual([['sh', '/home/u/repos/IdoNisso/claude-code-setup/sync.sh', 'status']])
  expect(published).toEqual([])
  expect(toasts).toEqual([])
})

test('publishes a drift summary and toasts once', async ($, on) => {
  const { clock, published, toasts } = setup(on, [DRIFTED])
  await startSession($)
  await clock.settle()
  await clock.advance(5 * 60_000)
  expect(published.map(one => one?.summary)).toEqual(['2 changed, 1 not in repo'])
  expect(published[0]?.isError).toBe(false)
  expect(toasts).toHaveLength(1)
})

test('clears the drift once back in sync', async ($, on) => {
  const { clock, published } = setup(on, [DRIFTED, IN_SYNC])
  await startSession($)
  await clock.settle()
  await clock.advance(5 * 60_000)
  expect(published.map(one => one?.summary ?? null)).toEqual(['2 changed, 1 not in repo', null])
})

test('says when sync.sh cannot run', async ($, on) => {
  const { clock, published } = setup(on, [{ exitCode: 127, stdout: '' }])
  await startSession($)
  await clock.settle()
  expect(published).toEqual([
    {
      summary: 'cannot run /home/u/repos/IdoNisso/claude-code-setup/sync.sh',
      isError: true,
      since: expect.any(Number),
    },
  ])
})

test('uses an absolute repo path as given', { options: { repoPath: '/srv/setup' } }, async ($, on) => {
  const { clock, runs } = setup(on, [IN_SYNC])
  await startSession($)
  await clock.settle()
  expect(runs).toEqual([['sh', '/srv/setup/sync.sh', 'status']])
})

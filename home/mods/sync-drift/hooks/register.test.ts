import { expect, mock, test } from 'claude-code/testing'

import type { On } from 'claude-code'
import type { Engine, Plugin } from 'claude-code/testing'

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

test('publishes a drift summary once, without a toast', async ($, on) => {
  const { clock, published, toasts } = setup(on, [DRIFTED])
  await startSession($)
  await clock.settle()
  await clock.advance(5 * 60_000)
  expect(published.map(one => one?.summary)).toEqual(['2 changed, 1 not in repo'])
  expect(published[0]?.isError).toBe(false)
  expect(toasts).toEqual([])
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

test('checks again from scratch when the mods pane asks', { plugins: [MODS_PANE] }, async ($, on) => {
  const { clock, runs, published } = setup(on, [DRIFTED])
  await startSession($)
  await clock.settle()
  await clock.advance(1_000)
  await requestReset($, 'sync-drift')
  await clock.settle()
  expect(runs).toHaveLength(2)
  expect(published.map(one => one?.summary ?? null)).toEqual(['2 changed, 1 not in repo', null, '2 changed, 1 not in repo'])
  expect(published[2]?.since).toBeGreaterThan(published[0]?.since ?? Infinity)
})

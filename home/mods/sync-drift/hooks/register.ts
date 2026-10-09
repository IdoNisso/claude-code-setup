import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

const CHECK_INTERVAL_MS = 5 * 60_000

const drift = atom({ plugin: 'sync-drift', key: 'drift' } as const, null)

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0

const summarize = (stdout: string) =>
  (
    [
      [count(stdout, /^--- repo\//gm), 'changed'],
      [count(stdout, /^not installed: /gm), 'not installed'],
      [count(stdout, /^not in repo: /gm), 'not in repo'],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(', ')

const repoPath = async ($: EngineInterface, options: PluginOptions) => {
  const path = String(options.repoPath)
  if (!path.startsWith('~/')) return path
  const home = await $.env.get('HOME')
  return `${home}${path.slice(1)}`
}

const publish = async ($: EngineInterface, summary: string | undefined, isError: boolean, toast: string) => {
  const before = await read($, drift)
  if (summary === before?.summary) return
  if (summary === undefined) return update($, drift, () => null)
  $.ui.toast(toast)
  const since = await $.clock.now()
  await update($, drift, () => ({ summary, isError, since }))
}

const check = async ($: EngineInterface, options: PluginOptions) => {
  const repo = await repoPath($, options)
  try {
    const { exitCode, stdout } = await $.process.run(['sh', `${repo}/sync.sh`, 'status'])
    if (exitCode === 0) return await publish($, undefined, false, '')
    const summary = exitCode === 1 ? summarize(stdout) : ''
    if (summary === '') throw new Error(`sync.sh exited ${exitCode}`)
    await publish($, summary, false, '~/.claude has drifted from the repo. Run ./sync.sh to review.')
  } catch {
    const message = `cannot run ${repo}/sync.sh`
    await publish($, message, true, `sync-drift: ${message}`)
  }
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    $.clock.after(0, () => void check($, options))
    $.clock.every(CHECK_INTERVAL_MS, () => void check($, options))
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const completed = await next(e)
    await check($, options)
    return completed
  })
}

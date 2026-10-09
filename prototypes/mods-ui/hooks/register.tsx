// PROTOTYPE — throwaway. Answers: what should TUI components for this repo's mods look like?
// `/mods-proto pane|band|status|report` switches variant, `sim` adds fake events, `clear` wipes.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ModEvent, ModName, Variant } from '../types'

const PANE = 'mods-proto'
const MODS: ModName[] = ['block-secrets', 'commit-lint', 'sync-drift']
const VARIANTS: Variant[] = ['pane', 'band', 'status', 'report']
const REPO = '/home/idonis/repos/IdoNisso/claude-code-setup'

const variant = atom({ plugin: 'prototype-mods-ui', key: 'variant' } as const, 'pane')
const events = atom({ plugin: 'prototype-mods-ui', key: 'events' } as const, [])
const drift = atom({ plugin: 'prototype-mods-ui', key: 'drift' } as const, null)
const isBandHidden = atom({ plugin: 'prototype-mods-ui', key: 'isBandHidden' } as const, false)
const isPaneHidden = atom({ plugin: 'prototype-mods-ui', key: 'isPaneHidden' } as const, false)
const unseen = atom({ plugin: 'prototype-mods-ui', key: 'unseen' } as const, 0)

const ICON: Record<ModName, string> = { 'block-secrets': '🛡', 'commit-lint': '✎', 'sync-drift': '⟳' }

const record = async ($: EngineInterface, mod: ModName, text: string) => {
  const at = await $.clock.now()
  await update($, events, list => [...list, { mod, text, at }].slice(-50))
  await update($, isBandHidden, () => false)
  if ((await read($, variant)) === 'pane' && (await read($, isPaneHidden))) await update($, unseen, n => n + 1)
  await refreshStatus($)
}

const countOf = (list: ModEvent[], mod: ModName) => list.filter(one => one.mod === mod).length

const ago = (now: number, at: number) => {
  const s = Math.round((now - at) / 1000)
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`
}

const summaryLine = (list: ModEvent[], driftText: string | null) =>
  [
    `${ICON['block-secrets']} ${countOf(list, 'block-secrets')} blocked`,
    `${ICON['commit-lint']} ${countOf(list, 'commit-lint')} commits fixed`,
    `${ICON['sync-drift']} ${driftText ?? 'in sync'}`,
  ].join('  ·  ')

const refreshStatus = async ($: EngineInterface) => {
  const current = await read($, variant)
  $.ui.status(current === 'status' ? `mods: ${summaryLine(await read($, events), await read($, drift))}` : undefined)
}

const showPane = async ($: EngineInterface) => {
  await update($, isPaneHidden, () => false)
  await update($, unseen, () => 0)
  await $.ui.open({ id: PANE, title: 'Mods (prototype)' })
  await refreshStatus($)
}

const hidePane = async ($: EngineInterface) => {
  await update($, isPaneHidden, () => true)
  await $.ui.close({ id: PANE })
  await refreshStatus($)
}

const setPane = async ($: EngineInterface, isShown: boolean) => {
  if (isShown) await showPane($)
  else await hidePane($)
  return isShown ? 'Mods pane shown.' : 'Mods pane hidden. /mods-pane true to show it again.'
}

const checkDrift = async ($: EngineInterface) => {
  try {
    const { exitCode, stdout } = await $.process.run(['sh', `${REPO}/sync.sh`, 'status'])
    const changed = stdout.match(/^--- repo\//gm)?.length ?? 0
    const untracked = stdout.match(/^not (installed|in repo): /gm)?.length ?? 0
    const text = exitCode === 0 ? null : `${changed} changed, ${untracked} untracked`
    const before = await read($, drift)
    await update($, drift, () => text)
    if (text !== null && text !== before) await record($, 'sync-drift', `drift: ${text}`)
  } catch {
    await update($, drift, () => 'sync.sh failed')
  }
  await refreshStatus($)
}

const simulate = async ($: EngineInterface) => {
  await record($, 'block-secrets', 'Bash: cat .env.local (references a .env file)')
  await record($, 'commit-lint', 'commit "fix: added null check" (use imperative mood)')
  await record($, 'block-secrets', 'Read ~/.ssh/id_ed25519 (references a credentials path)')
  await update($, drift, () => '2 changed, 1 untracked')
  await record($, 'sync-drift', 'drift: 2 changed, 1 untracked')
}

const report = (list: ModEvent[], driftText: string | null, now: number) =>
  [
    '### Mods',
    '',
    '| Mod | State | Events | Last |',
    '| --- | --- | --- | --- |',
    ...MODS.map(mod => {
      const last = list.filter(one => one.mod === mod).at(-1)
      const state = mod === 'sync-drift' ? (driftText ? `⚠ ${driftText}` : '✓ in sync') : '✓ armed'
      return `| ${ICON[mod]} ${mod} | ${state} | ${countOf(list, mod)} | ${last ? `${last.text} (${ago(now, last.at)} ago)` : '—'} |`
    }),
  ].join('\n')

const switchTo = async ($: EngineInterface, next: Variant) => {
  await update($, variant, () => next)
  if (next === 'pane') await showPane($)
  else await $.ui.close({ id: PANE })
  await update($, isBandHidden, () => false)
  await refreshStatus($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'mods-proto',
      description: 'PROTOTYPE: switch mod UI variant',
      argumentHint: 'pane|band|status|report|sim|clear',
    })
    await $.command.register({
      name: 'mods-pane',
      description: 'PROTOTYPE: show or hide the mods pane',
      argumentHint: '[true|false]',
      immediate: true,
    })
    $.clock.after(0, () => void checkDrift($))
    await refreshStatus($)
    if ((await read($, variant)) === 'pane' && !(await read($, isPaneHidden))) void $.ui.open({ id: PANE, title: 'Mods (prototype)' })
    return started
  })

  on('command.run', { command: 'mods-pane' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg !== '' && arg !== 'true' && arg !== 'false') return { text: 'Usage: /mods-pane [true|false]' }
    if ((await read($, variant)) !== 'pane') await update($, variant, () => 'pane')
    const isShown = arg === '' ? !(await $.ui.panes()).some(pane => pane.id === PANE) : arg === 'true'
    return { text: await setPane($, isShown) }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (e.origin.kind === 'person') await update($, isPaneHidden, () => true)
    return closed
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  on('command.run', { command: 'mods-proto' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'sim') await simulate($)
    else if (arg === 'clear') {
      await update($, events, () => [])
      await update($, drift, () => null)
      await refreshStatus($)
    } else if (VARIANTS.includes(arg as Variant)) await switchTo($, arg as Variant)
    else if (arg !== '') return { text: `Unknown "${arg}". Try: ${VARIANTS.join('|')}|sim|clear` }

    const current = await read($, variant)
    const list = await read($, events)
    const head = `Variant **${current}** · ${list.length} events · drift: ${(await read($, drift)) ?? 'none'}`
    return { text: current === 'report' ? `${head}\n\n${report(list, await read($, drift), await $.clock.now())}` : head }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const blocked = ran.deny?.match(/^Blocked by (block-secrets|commit-lint)/)
    if (blocked) await record($, blocked[1] as ModName, ran.deny!.replace(/^Blocked by [\w-]+: /, '').slice(0, 120)).catch(() => {})
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await checkDrift($)
    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, events)
    const driftText = await read($, drift)
    const now = await $.clock.now()
    const width = e.props.bodyColumns

    return (
      <Box flexDirection="column" width={width}>
        {MODS.map(mod => {
          const mine = list.filter(one => one.mod === mod)
          const isWarn = mod === 'sync-drift' ? driftText !== null : mine.length > 0
          return (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold color={isWarn ? 'warning' : 'success'}>
                {isWarn ? '●' : '○'} {ICON[mod]} {mod}{' '}
                <Text dimColor>
                  {mod === 'sync-drift' ? (driftText ?? 'in sync') : `${mine.length} blocked`}
                </Text>
              </Text>
              {mine.slice(-3).reverse().map(one => (
                <Text dimColor wrap="truncate-end">
                  {'  '}
                  {ago(now, one.at).padStart(3)} {one.text}
                </Text>
              ))}
            </Box>
          )
        })}
        <Box>
          <Button key="sim" label="Simulate" onPress={() => simulate($)} />
          <Text> </Text>
          <Button key="clear" label="Clear" onPress={() => update($, events, () => [])} />
          <Text> </Text>
          <Button key="recheck" label="Re-check drift" onPress={() => checkDrift($)} />
          <Text> </Text>
          <Button key="hide" label="Hide" hotkey="h" onPress={() => hidePane($)} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, variant)
    if (current === 'pane' && (await read($, isPaneHidden)) && !e.props.hasSurvey) {
      const { Box, Text, Button } = $.ui.resolve(e)
      const hiddenNew = await read($, unseen)
      return (
        <Box width={e.props.bodyColumns} justifyContent="flex-end">
          <Text dimColor>mods pane hidden</Text>
          {hiddenNew > 0 && (
            <Text color="warning">
              {' · '}
              {hiddenNew} new event{hiddenNew === 1 ? '' : 's'}
            </Text>
          )}
          <Text dimColor> · </Text>
          <Button key="show" plain label="/mods-pane true" onPress={() => showPane($)} />
        </Box>
      )
    }
    if (current !== 'band' || (await read($, isBandHidden))) return next(e)
    const list = await read($, events)
    const driftText = await read($, drift)
    if (list.length === 0 && driftText === null) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const last = list.at(-1)
    return (
      <Box>
        {MODS.map(mod => {
          const n = countOf(list, mod)
          const isWarn = mod === 'sync-drift' ? driftText !== null : n > 0
          return (
            <Text color={isWarn ? 'warning' : undefined} dimColor={!isWarn}>
              {ICON[mod]} {mod === 'sync-drift' ? (driftText ?? 'ok') : n}{'   '}
            </Text>
          )
        })}
        {last && <Text dimColor wrap="truncate-end">last: {last.text} </Text>}
        <Button key="details" label="Details" onPress={() => switchTo($, 'pane')} />
        <Button key="hide" label="Hide" onPress={() => update($, isBandHidden, () => true)} />
      </Box>
    )
  })
}

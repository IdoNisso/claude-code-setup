import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const PANE = 'mods'
const TITLE = 'Mods'
const STORE_KEY = 'isHidden'
const RECENT = 3

const isHidden = atom({ plugin: 'mods-pane', key: 'isHidden' } as const, false)
const hiddenAt = atom({ plugin: 'mods-pane', key: 'hiddenAt' } as const, 0)

const secretBlocks = atom({ plugin: 'block-secrets', key: 'blocks' } as const, [])
const commitBlocks = atom({ plugin: 'commit-lint', key: 'blocks' } as const, [])
const drift = atom({ plugin: 'sync-drift', key: 'drift' } as const, null)

type Entry = { at: number; text: string }

type Section = { name: string; summary: string; isAlert: boolean; recent: Entry[] }

const ago = (now: number, at: number) => {
  const s = Math.max(0, Math.round((now - at) / 1000))
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const sections = async ($: EngineInterface): Promise<Section[]> => {
  const secrets = await read($, secretBlocks)
  const commits = await read($, commitBlocks)
  const current = await read($, drift)
  return [
    {
      name: 'block-secrets',
      summary: `${plural(secrets.length, 'call')} blocked`,
      isAlert: secrets.length > 0,
      recent: secrets.map(one => ({ at: one.at, text: `${one.tool} call ${one.reason}` })),
    },
    {
      name: 'commit-lint',
      summary: `${plural(commits.length, 'commit')} blocked`,
      isAlert: commits.length > 0,
      recent: commits.map(one => ({ at: one.at, text: `"${one.subject}": ${one.problems.join('; ')}` })),
    },
    {
      name: 'sync-drift',
      summary: current === null ? 'in sync' : current.summary,
      isAlert: current !== null,
      recent: current === null ? [] : [{ at: current.since, text: current.isError ? 'check failed' : 'drift found' }],
    },
  ]
}

const unseenCount = async ($: EngineInterface) => {
  const since = await read($, hiddenAt)
  const all = await sections($)
  return all.flatMap(section => section.recent).filter(entry => entry.at > since).length
}

const setHidden = async ($: EngineInterface, hidden: boolean) => {
  await update($, isHidden, () => hidden)
  if (hidden) {
    const now = await $.clock.now()
    await update($, hiddenAt, () => now)
  }
  await $.store.set(STORE_KEY, hidden)
}

const show = async ($: EngineInterface) => {
  await setHidden($, false)
  await $.ui.open({ id: PANE, title: TITLE })
}

const hide = async ($: EngineInterface) => {
  await setHidden($, true)
  await $.ui.close({ id: PANE })
}

const isOpen = async ($: EngineInterface) => (await $.ui.panes()).some(pane => pane.id === PANE)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'mods-pane',
      description: 'Show or hide the mods pane; no argument toggles it',
      argumentHint: '[true|false]',
      immediate: true,
    })
    const wasHidden = (await $.store.get(STORE_KEY)) === true
    await update($, isHidden, () => wasHidden)
    if (!wasHidden) void $.ui.open({ id: PANE, title: TITLE })
    return started
  })

  on('command.run', { command: 'mods-pane' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg !== '' && arg !== 'true' && arg !== 'false') return { text: 'Usage: /mods-pane [true|false]' }
    const shouldShow = arg === '' ? !(await isOpen($)) : arg === 'true'
    if (shouldShow) await show($)
    else await hide($)
    return { text: shouldShow ? 'Mods pane shown.' : 'Mods pane hidden. /mods-pane to show it again.' }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (e.origin.kind === 'person') await setHidden($, true)
    return closed
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const now = await $.clock.now()
    return (
      <Box flexDirection="column" width={e.props.bodyColumns}>
        {(await sections($)).map(section => (
          <Box key={section.name} flexDirection="column" marginBottom={1}>
            <Text bold color={section.isAlert ? 'warning' : 'success'}>
              {section.isAlert ? '●' : '○'} {section.name} <Text dimColor>{section.summary}</Text>
            </Text>
            {section.recent
              .slice(-RECENT)
              .reverse()
              .map(entry => (
                <Text dimColor wrap="truncate-end">
                  {'  '}
                  {ago(now, entry.at).padStart(3)} {entry.text}
                </Text>
              ))}
          </Box>
        ))}
        <Box>
          <Button key="hide" label="Hide" hotkey="h" onPress={() => hide($)} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isHidden))) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const unseen = await unseenCount($)
    return (
      <Box width={e.props.bodyColumns} justifyContent="flex-end">
        <Text dimColor>mods pane hidden</Text>
        {unseen > 0 && <Text color="warning"> · {plural(unseen, 'new event')}</Text>}
        <Text dimColor> · </Text>
        <Button key="show" plain label="/mods-pane" onPress={() => show($)} />
      </Box>
    )
  })
}

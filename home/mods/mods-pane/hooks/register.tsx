import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const PANE = 'mods'
const TITLE = 'Mods'
const STORE_KEY = 'isHidden'
const RECENT = 3
const AGE_COLUMNS = 6

const isHidden = atom({ plugin: 'mods-pane', key: 'isHidden' } as const, false)
const hiddenAt = atom({ plugin: 'mods-pane', key: 'hiddenAt' } as const, 0)

const secretBlocks = atom({ plugin: 'block-secrets', key: 'blocks' } as const, [])
const commitBlocks = atom({ plugin: 'commit-lint', key: 'blocks' } as const, [])
const drift = atom({ plugin: 'sync-drift', key: 'drift' } as const, null)
const links = atom({ plugin: 'agent-links', key: 'links' } as const, [])

const LINK_LABELS = {
  'waiting-on-them': 'awaiting their reply',
  'waiting-on-me': 'awaiting our reply',
  watching: 'watching for idle',
  settled: 'settled',
} as const

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
  const peers = await read($, links)
  const waitingOn = peers.filter(link => link.state === 'waiting-on-them').map(link => link.peer)
  return [
    {
      name: 'sync-drift',
      summary: current === null ? 'in sync' : current.summary,
      isAlert: current !== null,
      recent: current === null ? [] : [{ at: current.since, text: current.isError ? 'check failed' : 'drift found' }],
    },
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
      name: 'agent-links',
      summary:
        peers.length === 0
          ? 'no peers'
          : waitingOn.length > 0
            ? `waiting on ${waitingOn.join(', ')}`
            : `${plural(peers.length, 'peer')}, nothing pending`,
      isAlert: peers.some(link => link.isOverdue),
      recent: peers.map(link => ({
        at: link.since,
        text: `${link.peer} · ${link.place} · ${LINK_LABELS[link.state]} · ${link.peerStatus}`,
      })),
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

let hasAutoOpened = false

const openWhereItDocks = async ($: EngineInterface, isFullscreen: boolean | undefined) => {
  if (hasAutoOpened || isFullscreen !== true || (await read($, isHidden))) return
  hasAutoOpened = true
  void $.ui.open({ id: PANE, title: TITLE })
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
      <Box
        flexDirection="column"
        width={e.props.bodyColumns}
        minHeight={e.props.placement === 'dock' ? e.props.scroll.bodyRows : undefined}
      >
        {(await sections($)).map((section, index, all) => (
          <Box key={section.name} flexDirection="column" marginBottom={index === all.length - 1 ? 1 : 0}>
            {index > 0 && <Text dimColor>{'─'.repeat(e.props.bodyColumns)}</Text>}
            <Text bold color={section.isAlert ? 'warning' : 'success'}>
              {section.isAlert ? '●' : '○'} {section.name} <Text dimColor>{section.summary}</Text>
            </Text>
            {section.recent
              .slice(-RECENT)
              .reverse()
              .map(entry => (
                <Box>
                  <Box width={AGE_COLUMNS} flexShrink={0}>
                    <Text dimColor>{ago(now, entry.at).padStart(5)}</Text>
                  </Box>
                  <Box flexGrow={1} flexShrink={1}>
                    <Text dimColor>{entry.text}</Text>
                  </Box>
                </Box>
              ))}
          </Box>
        ))}
        <Box flexGrow={1} />
        <Box justifyContent="flex-end">
          <Button key="hide" label="Hide" hotkey="h" onPress={() => hide($)} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await openWhereItDocks($, e.viewport?.isFullscreen)
    const hidden = await read($, isHidden)
    const current = await read($, drift)
    if (e.props.hasSurvey || (!hidden && current === null)) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const unseen = hidden ? await unseenCount($) : 0
    return (
      <Box width={e.props.bodyColumns} justifyContent="flex-end">
        {current !== null && (
          <Text color={current.isError ? 'error' : 'warning'}>
            {current.isError ? `sync-drift: ${current.summary}` : `~/.claude drift: ${current.summary} · run ./sync.sh`}
          </Text>
        )}
        {current !== null && hidden && <Text dimColor> │ </Text>}
        {hidden && <Text dimColor>mods pane hidden</Text>}
        {unseen > 0 && <Text color="warning"> · {plural(unseen, 'new event')}</Text>}
        {hidden && <Text dimColor> · </Text>}
        {hidden && <Button key="show" plain label="/mods-pane" onPress={() => show($)} />}
      </Box>
    )
  })
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ModName } from '../types'

const PANE = 'mods'
const TITLE = 'Mods'
const AGE_COLUMNS = 6
const DEFAULT_RECENT = 3
const MAX_RECENT = 20

const MODS: ModName[] = ['sync-drift', 'block-secrets', 'commit-lint', 'agent-links']

const isHidden = atom({ plugin: 'mods-pane', key: 'isHidden' } as const, false)
const hiddenAt = atom({ plugin: 'mods-pane', key: 'hiddenAt' } as const, 0)
const removed = atom({ plugin: 'mods-pane', key: 'removed' } as const, [])
const order = atom({ plugin: 'mods-pane', key: 'order' } as const, MODS)
const recent = atom({ plugin: 'mods-pane', key: 'recent' } as const, DEFAULT_RECENT)
const resetRequest = atom({ plugin: 'mods-pane', key: 'resetRequest' } as const, null)
const dismissRequest = atom({ plugin: 'mods-pane', key: 'dismissRequest' } as const, null)

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

const USAGE = [
  'Usage: /mods-pane [show|hide]          toggle with no argument',
  '       /mods-pane remove <mod>...      drop sections from the pane',
  '       /mods-pane add <mod>...         bring them back',
  '       /mods-pane reset <mod>...|all   clear a mod\'s own state',
  '       /mods-pane order <mod>...       put these first; no mods restores the default',
  `       /mods-pane recent [n]           entries per section (1-${MAX_RECENT}); no n shows it`,
  '       /mods-pane list                 every mod\'s status',
  `Mods: ${MODS.join(', ')} (or a half of a name, like "secrets")`,
].join('\n')

type Entry = { at: number; text: string; dismissId?: string }

type Section = { name: ModName; summary: string; isAlert: boolean; recent: Entry[] }

const ago = (now: number, at: number) => {
  const s = Math.max(0, Math.round((now - at) / 1000))
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const entries = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`

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
        dismissId: link.peer,
        text: `${link.peer} · ${link.place} · ${LINK_LABELS[link.state]} · ${link.peerStatus}`,
      })),
    },
  ]
}

const shownSections = async ($: EngineInterface) => {
  const all = await sections($)
  const hidden = await read($, removed)
  return (await read($, order))
    .filter(name => !hidden.includes(name))
    .map(name => all.find(section => section.name === name) as Section)
}

const unseenCount = async ($: EngineInterface) => {
  const since = await read($, hiddenAt)
  const shown = await shownSections($)
  return shown.flatMap(section => section.recent).filter(entry => entry.at > since).length
}

const resolveMod = (arg: string) => {
  const exact = MODS.find(name => name === arg)
  if (exact !== undefined) return exact
  const halves = MODS.filter(name => name.split('-').includes(arg))
  return halves.length === 1 ? halves[0] : undefined
}

const resolveMods = (args: string[]) => {
  const mods = args.map(resolveMod)
  const unknown = args.filter((_, index) => mods[index] === undefined)
  return { mods: [...new Set(mods.filter((mod): mod is ModName => mod !== undefined))], unknown }
}

const unknownMods = (unknown: string[]) =>
  `Unknown mod${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}. Mods: ${MODS.join(', ')}`

const knownMods = (stored: unknown): ModName[] =>
  Array.isArray(stored) ? [...new Set(stored)].filter((name): name is ModName => MODS.includes(name)) : []

const withDefaultOrder = (stored: unknown) => {
  const known = knownMods(stored)
  return [...known, ...MODS.filter(name => !known.includes(name))]
}

const validRecent = (stored: unknown) => {
  const n = Number(stored)
  return Number.isInteger(n) && n >= 1 && n <= MAX_RECENT ? n : undefined
}

const persist = async ($: EngineInterface, key: string, value: boolean | number | ModName[]) => {
  await $.store.set(key, value)
}

const setHidden = async ($: EngineInterface, hidden: boolean) => {
  await update($, isHidden, () => hidden)
  if (hidden) {
    const now = await $.clock.now()
    await update($, hiddenAt, () => now)
  }
  await persist($, 'isHidden', hidden)
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

const toggle = async ($: EngineInterface, shouldShow: boolean) => {
  if (shouldShow) await show($)
  else await hide($)
  return shouldShow ? 'Mods pane shown.' : 'Mods pane hidden. /mods-pane to show it again.'
}

const setRemoved = async ($: EngineInterface, args: string[], isRemoving: boolean) => {
  const { mods, unknown } = resolveMods(args)
  if (args.length === 0) return `Name at least one mod. Mods: ${MODS.join(', ')}`
  if (unknown.length > 0) return unknownMods(unknown)
  const next = await update($, removed, list =>
    isRemoving ? [...new Set([...list, ...mods])] : list.filter(name => !mods.includes(name)),
  )
  await persist($, 'removed', next)
  return `${isRemoving ? 'Removed' : 'Added'} ${mods.join(', ')}.`
}

const requestReset = async ($: EngineInterface, args: string[]) => {
  if (args.length === 0) return `Name a mod or "all". Mods: ${MODS.join(', ')}`
  const { mods, unknown } = args.includes('all') ? { mods: MODS, unknown: [] } : resolveMods(args)
  if (unknown.length > 0) return unknownMods(unknown)
  const at = await $.clock.now()
  await update($, resetRequest, () => ({ mods, at }))
  return `Asked ${mods.join(', ')} to reset.`
}

const requestDismiss = async ($: EngineInterface, mod: ModName, entry: string) => {
  const at = await $.clock.now()
  await update($, dismissRequest, () => ({ mod, entry, at }))
}

const setOrder = async ($: EngineInterface, args: string[]) => {
  const { mods, unknown } = resolveMods(args)
  if (unknown.length > 0) return unknownMods(unknown)
  const current = await read($, order)
  const next = mods.length === 0 ? MODS : [...mods, ...current.filter(name => !mods.includes(name))]
  await update($, order, () => next)
  await persist($, 'order', next)
  return `Order: ${next.join(', ')}.`
}

const setRecent = async ($: EngineInterface, args: string[]) => {
  if (args.length === 0) return `Showing up to ${entries(await read($, recent))} per section. /mods-pane recent <n> changes it.`
  const n = validRecent(args[0])
  if (args.length !== 1 || n === undefined) return `Give a whole number from 1 to ${MAX_RECENT}, like /mods-pane recent 5.`
  await update($, recent, () => n)
  await persist($, 'recent', n)
  return `Showing up to ${entries(n)} per section.`
}

const listMods = async ($: EngineInterface) => {
  const all = await sections($)
  const hidden = await read($, removed)
  const width = Math.max(...MODS.map(name => name.length))
  const rows = (await read($, order)).map(name => {
    const section = all.find(one => one.name === name) as Section
    const state = hidden.includes(name) ? 'removed' : 'shown  '
    return `${section.isAlert ? '●' : '○'} ${name.padEnd(width)}  ${state}  ${section.summary}`
  })
  const pane = (await isOpen($)) ? 'shown' : 'hidden'
  return [`Mods pane ${pane}, ${entries(await read($, recent))} per section`, ...rows].join('\n')
}

const runCommand = async ($: EngineInterface, args: string) => {
  const [verb = '', ...rest] = args.trim().split(/\s+/).filter(word => word !== '')
  switch (verb) {
    case '':
      return toggle($, !(await isOpen($)))
    case 'show':
      return toggle($, true)
    case 'hide':
      return toggle($, false)
    case 'add':
      return setRemoved($, rest, false)
    case 'remove':
      return setRemoved($, rest, true)
    case 'reset':
      return requestReset($, rest)
    case 'order':
      return setOrder($, rest)
    case 'recent':
      return setRecent($, rest)
    case 'list':
      return listMods($)
    case 'help':
      return USAGE
    default:
      return `Unknown argument "${verb}".\n${USAGE}`
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'mods-pane',
      description: 'Show, hide or customize the mods pane; no argument toggles it',
      argumentHint: '[show|hide|add|remove|reset|order|recent|list|help]',
      immediate: true,
    })
    const stored = {
      isHidden: await $.store.get('isHidden'),
      removed: await $.store.get('removed'),
      order: await $.store.get('order'),
      recent: await $.store.get('recent'),
    }
    await update($, isHidden, () => stored.isHidden === true)
    await update($, removed, () => knownMods(stored.removed))
    await update($, order, () => withDefaultOrder(stored.order))
    await update($, recent, () => validRecent(stored.recent) ?? DEFAULT_RECENT)
    return started
  })

  on('command.run', { command: 'mods-pane' }, async ($, e) => ({ text: await runCommand($, e.args) }))

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (e.origin.kind === 'person') await setHidden($, true)
    return closed
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const now = await $.clock.now()
    const shown = await shownSections($)
    const limit = await read($, recent)
    return (
      <Box
        flexDirection="column"
        width={e.props.bodyColumns}
        minHeight={e.props.placement === 'dock' ? e.props.scroll.bodyRows : undefined}
      >
        {shown.length === 0 && (
          <Box marginBottom={1}>
            <Text dimColor>Every mod is removed. /mods-pane add &lt;mod&gt; brings one back.</Text>
          </Box>
        )}
        {shown.map((section, index) => (
          <Box key={section.name} flexDirection="column" marginBottom={index === shown.length - 1 ? 1 : 0}>
            {index > 0 && <Text dimColor>{'─'.repeat(e.props.bodyColumns)}</Text>}
            <Text bold color={section.isAlert ? 'warning' : 'success'}>
              {section.isAlert ? '●' : '○'} {section.name} <Text dimColor>{section.summary}</Text>
            </Text>
            {section.recent
              .slice(-limit)
              .reverse()
              .map(entry => (
                <Box>
                  <Box width={AGE_COLUMNS} flexShrink={0}>
                    <Text dimColor>{ago(now, entry.at).padStart(5)}</Text>
                  </Box>
                  <Box flexGrow={1} flexShrink={1}>
                    <Text dimColor>{entry.text}</Text>
                  </Box>
                  {entry.dismissId !== undefined && (
                    <Box flexShrink={0} marginLeft={1}>
                      <Button
                        key={`dismiss:${section.name}:${entry.dismissId}`}
                        plain
                        label="×"
                        onPress={() => requestDismiss($, section.name, entry.dismissId as string)}
                      />
                    </Box>
                  )}
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

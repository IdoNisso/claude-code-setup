import { expect, mock, test } from 'claude-code/testing'

import type { On } from 'claude-code'
import type { Engine, Plugin } from 'claude-code/testing'

import type { Link } from '../types'

const DIR = '/home/u/.claude/agent-links'
const ME = 'setup-f9'
const PEER = 'brain-55'

const MODS_PANE: Plugin = {
  name: 'mods-pane',
  register: on => {
    on('command.run', { command: 'reset' }, async ($, e) => {
      await $.state.set({ plugin: 'mods-pane', key: 'resetRequest' } as never, { mods: e.args.split(' '), at: 1 } as never)
      return { text: '' }
    })
  },
}

const MODS_PANE_DISMISS: Plugin = {
  name: 'mods-pane',
  register: on => {
    on('command.run', { command: 'dismiss' }, async ($, e) => {
      const [mod, entry] = e.args.split(' ')
      await $.state.set({ plugin: 'mods-pane', key: 'dismissRequest' } as never, { mod, entry, at: 1 } as never)
      return { text: '' }
    })
  },
}

const requestDismiss = ($: Engine, mod: string, entry: string) =>
  $.command.run({ command: 'dismiss', args: `${mod} ${entry}`, origin: { kind: 'composer' }, presentation: {} } as never)

const requestReset = ($: Engine, mods: string) =>
  $.command.run({ command: 'reset', args: mods, origin: { kind: 'composer' }, presentation: {} } as never)

type Card = {
  sessionId: string
  name: string | null
  cwd: string
  repo: string | null
  status: 'busy' | 'idle' | 'ended'
  statusAt: number
  heartbeatAt: number
  sent: Record<string, { at: number; isReply: boolean }>
  watching: Record<string, number>
  dismissed?: Record<string, number>
}

const peerCard = (now: number, fields: Partial<Card> = {}): Card => ({
  sessionId: 's-peer',
  name: PEER,
  cwd: '/home/u/repos/brain/src',
  repo: '/home/u/repos/brain',
  status: 'busy',
  statusAt: now,
  heartbeatAt: now,
  sent: {},
  watching: {},
  ...fields,
})

const setup = (on: On) => {
  const files = new Map<string, string>()
  const published: Link[][] = []
  const toasts: string[] = []
  const clock = mock.clock(on)
  mock.env(on, { HOME: '/home/u' })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 's-me' }))
  on('session.cwd', () => ({ value: '/home/u/repos/setup' }))
  on('session.repo', () => ({ value: { root: '/home/u/repos/setup', remote: null, internal: false, name: null } }) as never)
  on('fs.write', (_$, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.read', (_$, e) => {
    const text = files.get(e.path)
    if (text === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: text }
  })
  on('fs.list', (_$, e) => ({
    value: [...files.keys()]
      .filter(path => path.startsWith(`${e.path}/`))
      .map(path => ({ name: path.slice(e.path.length + 1), kind: 'file', size: 1, mtimeMs: 0, isLink: false })),
  }) as never)
  on('tool.call', { tool: 'ListAgents' }, () =>
    ({ result: { listing: `This session is ${ME} [b18b80] — the name other sessions use` }, text: '' }) as never,
  )
  on('tool.call', { tool: 'SendMessage' }, () => ({ result: {}, text: 'sent' }) as never)
  on('session.send', () => ({ isDelivered: true }))
  on('session.receive', (_$, e) => ({ text: e.text }))
  on('state.set', { plugin: 'agent-links', key: 'links' }, (_$, e, next) => {
    published.push(e.value)
    return next(e)
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  const writePeer = (card: Card) => files.set(`${DIR}/${card.sessionId}.json`, JSON.stringify(card))
  const ownCard = () => JSON.parse(files.get(`${DIR}/s-me.json`) ?? 'null') as Card | null
  const latest = () => published.at(-1) ?? []
  return { clock, files, toasts, writePeer, ownCard, latest }
}

const send = ($: Engine, to: string, text: string) => $.session.send({ to, text, origin: { kind: 'model' } })

const startSession = async ($: Engine, clock: { settle: () => Promise<void> }) => {
  await $.session.start({ cwd: '/home/u/repos/setup', surface: 'terminal', isInteractive: true } as never)
  await clock.settle()
}

test('registers this session with its name and repo', async ($, on) => {
  const { clock, ownCard } = setup(on)
  await startSession($, clock)
  expect(ownCard()).toMatchObject({ sessionId: 's-me', name: ME, repo: '/home/u/repos/setup', status: 'idle' })
})

test('a message to a peer waits on its reply', async ($, on) => {
  const { clock, writePeer, latest } = setup(on)
  writePeer(peerCard(clock.now()))
  await startSession($, clock)
  await send($, `${PEER} [817149]`, 'which schema?')
  expect(latest()).toEqual([
    {
      peer: PEER,
      place: '~/repos/brain',
      state: 'waiting-on-them',
      since: clock.now(),
      isOverdue: false,
      peerStatus: 'busy',
    },
  ])
})

test('a reply from the peer settles the link', async ($, on) => {
  const { clock, writePeer, latest } = setup(on)
  writePeer(peerCard(clock.now()))
  await startSession($, clock)
  await send($, PEER, 'which schema?')
  await clock.advance(1_000)
  writePeer(peerCard(clock.now(), { sent: { [ME]: { at: clock.now(), isReply: true } } }))
  await $.session.receive({ origin: { kind: 'peer' }, text: 'v2' } as never)
  expect(latest().map(link => link.state)).toEqual(['settled'])
})

test('an unanswered message from the peer waits on this session', async ($, on) => {
  const { clock, writePeer, latest } = setup(on)
  await startSession($, clock)
  writePeer(peerCard(clock.now(), { sent: { [ME]: { at: clock.now(), isReply: false } } }))
  await $.session.receive({ origin: { kind: 'peer' }, text: 'ping' } as never)
  expect(latest().map(link => link.state)).toEqual(['waiting-on-me'])
})

test('answering a peer settles the link and marks the send a reply', async ($, on) => {
  const { clock, writePeer, ownCard, latest } = setup(on)
  await startSession($, clock)
  writePeer(peerCard(clock.now(), { sent: { [ME]: { at: clock.now(), isReply: false } } }))
  await clock.advance(1_000)
  await send($, PEER, 'v2')
  expect(ownCard()?.sent[PEER]?.isReply).toBe(true)
  expect(latest().map(link => link.state)).toEqual(['settled'])
})

test('a new message after a settled exchange waits again', async ($, on) => {
  const { clock, writePeer, ownCard, latest } = setup(on)
  await startSession($, clock)
  await send($, PEER, 'which schema?')
  await clock.advance(1_000)
  writePeer(peerCard(clock.now(), { sent: { [ME]: { at: clock.now(), isReply: true } } }))
  await clock.advance(1_000)
  await send($, PEER, 'and the migrations?')
  expect(ownCard()?.sent[PEER]?.isReply).toBe(false)
  expect(latest().map(link => link.state)).toEqual(['waiting-on-them'])
})

test('toasts once when a reply is overdue', async ($, on) => {
  const { clock, writePeer, toasts, latest } = setup(on)
  writePeer(peerCard(clock.now()))
  await startSession($, clock)
  await send($, PEER, 'which schema?')
  for (let i = 0; i < 16; i++) {
    writePeer(peerCard(clock.now()))
    await clock.advance(15_000)
  }
  expect(latest()[0]?.isOverdue).toBe(true)
  expect(toasts).toEqual([`agent-links: no reply from ${PEER} for 3m`])
})

test('a peer that stops beating is gone', async ($, on) => {
  const { clock, writePeer, latest } = setup(on)
  writePeer(peerCard(clock.now()))
  await startSession($, clock)
  await send($, PEER, 'still there?')
  await clock.advance(90_000)
  expect(latest()[0]?.peerStatus).toBe('gone')
})

test('watches a peer until it goes idle', async ($, on) => {
  const { clock, writePeer, latest } = setup(on)
  writePeer(peerCard(clock.now()))
  await startSession($, clock)
  await $.tool.call({ tool: 'SendMessage', to: PEER, notify_when_idle: true } as never)
  expect(latest().map(link => link.state)).toEqual(['watching'])
  await clock.advance(1_000)
  writePeer(peerCard(clock.now(), { status: 'idle', statusAt: clock.now() }))
  await clock.advance(15_000)
  expect(latest().map(link => link.state)).toEqual(['settled'])
})

test('ignores peers it never talked with', async ($, on) => {
  const { clock, writePeer, latest } = setup(on)
  writePeer(peerCard(clock.now()))
  await startSession($, clock)
  await clock.advance(15_000)
  expect(latest()).toEqual([])
})

test('forgets earlier messages when the mods pane asks', { plugins: [MODS_PANE] }, async ($, on) => {
  const { clock, writePeer, latest } = setup(on)
  writePeer(peerCard(clock.now(), { sent: { [ME]: { at: clock.now(), isReply: false } } }))
  await startSession($, clock)
  await send($, PEER, 'which schema?')
  expect(latest()).toHaveLength(1)
  await requestReset($, 'agent-links')
  expect(latest()).toEqual([])
  await clock.advance(1_000)
  await send($, PEER, 'still there?')
  expect(latest().map(link => link.state)).toEqual(['waiting-on-them'])
})

test('dismisses one link when the mods pane asks', { plugins: [MODS_PANE_DISMISS] }, async ($, on) => {
  const { clock, writePeer, ownCard, latest } = setup(on)
  writePeer(peerCard(clock.now()))
  writePeer(peerCard(clock.now(), { sessionId: 's-other', name: 'other-1' }))
  await startSession($, clock)
  await send($, PEER, 'which schema?')
  await send($, 'other-1', 'and you?')
  await clock.advance(90_000)
  expect(latest().map(link => link.peerStatus)).toEqual(['gone', 'gone'])
  await requestDismiss($, 'agent-links', PEER)
  expect(latest().map(link => link.peer)).toEqual(['other-1'])
  expect(ownCard()?.dismissed).toEqual({ [PEER]: clock.now() })
  await requestDismiss($, 'block-secrets', 'other-1')
  expect(latest().map(link => link.peer)).toEqual(['other-1'])
})

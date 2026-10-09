import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Link, LinkState, PeerStatus } from '../types'

const HEARTBEAT_MS = 15_000
const STALE_MS = 4 * HEARTBEAT_MS
const FORGET_MS = 24 * 3600_000
const OVERDUE_MS = 3 * 60_000

const links = atom({ plugin: 'agent-links', key: 'links' } as const, [])

type Message = { at: number; isReply: boolean }

type Card = {
  sessionId: string
  name: string | null
  cwd: string
  repo: string | null
  status: 'busy' | 'idle' | 'ended'
  statusAt: number
  heartbeatAt: number
  sent: Record<string, Message>
  watching: Record<string, number>
  clearedAt?: number
}

let card: Card | undefined
const toasted = new Map<string, number>()

const registryDir = async ($: EngineInterface) => `${await $.env.get('HOME')}/.claude/agent-links`

const cardPath = async ($: EngineInterface, sessionId: string) => `${await registryDir($)}/${sessionId}.json`

const peerName = (to: string) => to.replace(/\s*\[[^\]]*\]$/, '').trim()

const readCard = async ($: EngineInterface, path: string): Promise<Card | undefined> => {
  try {
    return JSON.parse(await $.fs.read(path)) as Card
  } catch {
    return undefined
  }
}

const ownName = async ($: EngineInterface) => {
  try {
    const called = await $.tool.call({ tool: 'ListAgents' })
    const listing = 'result' in called ? (called.result as { listing?: unknown }).listing : undefined
    if (typeof listing !== 'string') return null
    return /This session is (\S+) \[/.exec(listing)?.[1] ?? null
  } catch {
    return null
  }
}

const save = async ($: EngineInterface) => {
  if (card === undefined) return
  card.heartbeatAt = await $.clock.now()
  await $.fs.write(await cardPath($, card.sessionId), JSON.stringify(card))
}

const peers = async ($: EngineInterface, self: Card) => {
  const dir = await registryDir($)
  const now = await $.clock.now()
  const entries = await $.fs.list(dir).catch(() => [])
  const cards = await Promise.all(
    entries.filter(entry => entry.name.endsWith('.json')).map(entry => readCard($, `${dir}/${entry.name}`)),
  )
  return cards.filter(
    (one): one is Card & { name: string } =>
      one !== undefined && one.sessionId !== self.sessionId && one.name !== null && now - one.heartbeatAt < FORGET_MS,
  )
}

const place = (peer: Card, home: string) => {
  const path = peer.repo ?? peer.cwd
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
}

const lastSaid = (mine: Message | undefined, theirs: Message | undefined) => {
  if (mine === undefined && theirs === undefined) return undefined
  const isMineLast = (mine?.at ?? -Infinity) >= (theirs?.at ?? -Infinity)
  const last = (isMineLast ? mine : theirs) as Message
  const state: LinkState = last.isReply ? 'settled' : isMineLast ? 'waiting-on-them' : 'waiting-on-me'
  return { state, at: last.at }
}

const heard = (self: Card, peer: Card) => (self.name === null ? undefined : peer.sent[self.name])

const isAfterClear = (self: Card, at: number | undefined): at is number =>
  at !== undefined && at > (self.clearedAt ?? -Infinity)

const sinceCleared = (self: Card, said: Message | undefined) => (isAfterClear(self, said?.at) ? said : undefined)

const linkTo = (self: Card, peer: Card & { name: string }, now: number, home: string): Link | undefined => {
  const said = lastSaid(sinceCleared(self, self.sent[peer.name]), sinceCleared(self, heard(self, peer)))
  const watched = self.watching[peer.name]
  const watchedAt = isAfterClear(self, watched) ? watched : undefined
  if (said === undefined && watchedAt === undefined) return undefined
  const isStale = now - peer.heartbeatAt > STALE_MS
  const peerStatus: PeerStatus = isStale || peer.status === 'ended' ? 'gone' : peer.status
  const hasGoneIdle = peer.status === 'idle' && peer.statusAt > (watchedAt ?? Infinity)
  const isWatching = watchedAt !== undefined && peerStatus !== 'gone' && !hasGoneIdle
  const state: LinkState =
    said?.state === 'waiting-on-them' ? said.state : isWatching ? 'watching' : (said?.state ?? 'settled')
  const since = Math.max(said?.at ?? -Infinity, isWatching ? watchedAt : -Infinity)
  const isOverdue = state === 'waiting-on-them' && now - since > OVERDUE_MS
  return { peer: peer.name, place: place(peer, home), state, since, isOverdue, peerStatus }
}

const toastOverdue = ($: EngineInterface, now: number, found: Link[]) => {
  for (const link of found) {
    if (!link.isOverdue || toasted.get(link.peer) === link.since) continue
    toasted.set(link.peer, link.since)
    const minutes = Math.round((now - link.since) / 60_000)
    $.ui.toast(`agent-links: no reply from ${link.peer} for ${minutes}m`)
  }
}

const refresh = async ($: EngineInterface) => {
  if (card === undefined) return
  const self = card
  const now = await $.clock.now()
  const home = await $.env.get('HOME')
  const found = (await peers($, self))
    .map(peer => linkTo(self, peer, now, home ?? ''))
    .filter((link): link is Link => link !== undefined)
    .sort((a, b) => a.since - b.since)
  toastOverdue($, now, found)
  const before = await read($, links)
  if (JSON.stringify(before) !== JSON.stringify(found)) await update($, links, () => found)
}

const beat = async ($: EngineInterface) => {
  if (card === undefined) return
  card.name ??= await ownName($)
  await save($)
  await refresh($)
}

const start = async ($: EngineInterface) => {
  const sessionId = await $.session.id()
  const stored = await readCard($, await cardPath($, sessionId))
  const now = await $.clock.now()
  card = {
    sessionId,
    name: await ownName($),
    cwd: await $.session.cwd(),
    repo: (await $.session.repo())?.root ?? null,
    status: 'idle',
    statusAt: now,
    heartbeatAt: now,
    sent: stored?.sent ?? {},
    watching: stored?.watching ?? {},
  }
  await save($)
  await refresh($)
}

const setStatus = async ($: EngineInterface, status: Card['status']) => {
  if (card === undefined) return
  card.status = status
  card.statusAt = await $.clock.now()
  await save($)
}

const quietly = (work: Promise<unknown>) => work.catch(() => undefined)

const clear = async ($: EngineInterface) => {
  if (card === undefined) return
  card.clearedAt = await $.clock.now()
  toasted.clear()
  await save($)
  await refresh($)
}

const recordSend = async ($: EngineInterface, to: string) => {
  if (card === undefined) return
  const self = card
  const name = peerName(to)
  const peer = (await peers($, self)).find(one => one.name === name)
  const isReply = peer !== undefined && lastSaid(self.sent[name], heard(self, peer))?.state === 'waiting-on-me'
  self.sent[name] = { at: await $.clock.now(), isReply }
  await save($)
  await refresh($)
}

const recordWatch = async ($: EngineInterface, to: string) => {
  if (card === undefined) return
  card.watching[peerName(to)] = await $.clock.now()
  await save($)
  await refresh($)
}

const passThrough = <E, R>($: unknown, e: E, next: { called: boolean } & ((e: E) => Promise<R>)) =>
  next.called ? undefined : next(e)

const isResetFor = (request: unknown, name: string) => {
  const mods = (request as { mods?: unknown } | null)?.mods
  return Array.isArray(mods) && mods.includes(name)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await quietly(start($))
    $.clock.every(HEARTBEAT_MS, () => void quietly(beat($)))
    return started
  })

  on('session.end', async ($, e, next) => {
    await quietly(setStatus($, 'ended'))
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await quietly(setStatus($, 'busy'))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const completed = await next(e)
    await quietly(setStatus($, 'idle').then(() => refresh($)))
    return completed
  })

  on('session.send', async ($, e, next) => {
    const sent = await next(e)
    if (sent.isDelivered) await quietly(recordSend($, e.to))
    return sent
  }).catch(passThrough)

  on('session.receive', async ($, e, next) => {
    const received = await next(e)
    await quietly(refresh($))
    return received
  }).catch(passThrough)

  on('tool.call', { tool: 'SendMessage' }, async ($, e, next) => {
    const called = await next(e)
    const isSubscribed = e.notify_when_idle === true && !('deny' in called) && called.isError !== true
    if (isSubscribed && typeof e.to === 'string') await quietly(recordWatch($, e.to))
    return called
  }).catch(passThrough)

  on('state.set', { plugin: 'mods-pane', key: 'resetRequest' }, async ($, e, next) => {
    const set = await next(e)
    if (isResetFor(e.value, 'agent-links')) await quietly(clear($))
    return set
  }).catch(passThrough)
}

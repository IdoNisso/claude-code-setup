import { describe, expect, mock, test } from 'claude-code/testing'

import type { On, Register } from 'claude-code'
import type { Engine, Plugin } from 'claude-code/testing'

const PANE = 'mods'

const stubEngine = (on: On, stored: Record<string, unknown> = {}) => {
  const open = new Set<string>()
  const clock = mock.clock(on)
  mock.store(on, stored)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }) as never)
  on('ui.open', (_$, e) => {
    open.add(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', (_$, e) => {
    open.delete(e.id)
    return { value: undefined } as never
  })
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('ui.panes', () =>
    ({ value: [...open].map(id => ({ id, title: 'Mods', isShown: true, isFocused: false, isPlaced: true })) }) as never,
  )
  return { clock, open }
}

const startSession = ($: Engine) =>
  $.session.start({ cwd: '/home/u', surface: 'terminal', isInteractive: true } as never)

const runCommand = ($: Engine, args: string) =>
  $.command.run({ command: 'mods-pane', args, origin: { kind: 'composer' }, presentation: {} } as never)

const mountBand = ($: Engine, isFullscreen?: boolean) =>
  $.ui.mount({
    plugin: 'mods-pane',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { bodyColumns: 80, hasSurvey: false } as never,
    ...(isFullscreen === undefined ? {} : { viewport: { columns: 160, rows: 40, isFullscreen } }),
  } as never)

const publisher = (name: string, write: Register): Plugin => ({ name, register: write })

const PUBLISHERS: Plugin[] = [
  publisher('block-secrets', on => {
    on('session.start', async ($, e, next) => {
      await $.state.set({ plugin: 'block-secrets', key: 'blocks' }, [
        { tool: 'Bash', reason: 'prints a GitHub token', at: 5_000 },
      ])
      return next(e)
    })
  }),
  publisher('commit-lint', on => {
    on('session.start', async ($, e, next) => {
      await $.state.set({ plugin: 'commit-lint', key: 'blocks' }, [
        { subject: 'Fix bug', problems: ['must start with "<type>: "'], at: 6_000 },
      ])
      return next(e)
    })
  }),
  publisher('sync-drift', on => {
    on('session.start', async ($, e, next) => {
      await $.state.set({ plugin: 'sync-drift', key: 'drift' }, {
        summary: '2 changed',
        isError: false,
        since: 7_000,
      })
      return next(e)
    })
  }),
  publisher('agent-links', on => {
    on('session.start', async ($, e, next) => {
      await $.state.set({ plugin: 'agent-links', key: 'links' }, [
        {
          peer: 'brain-55',
          place: '~/repos/brain',
          state: 'waiting-on-them',
          since: 4_000,
          isOverdue: true,
          peerStatus: 'busy',
        },
      ])
      return next(e)
    })
  }),
]

describe('visibility', () => {
  test('opens the pane unasked where it docks', async ($, on) => {
    const { open } = stubEngine(on)
    await startSession($)
    expect([...open]).toEqual([])
    await mountBand($, true)
    expect([...open]).toEqual([PANE])
  })

  test('waits for the command on the main screen', async ($, on) => {
    const { open } = stubEngine(on)
    await startSession($)
    await mountBand($, false)
    await mountBand($)
    expect([...open]).toEqual([])
    await runCommand($, '')
    expect([...open]).toEqual([PANE])
  })

  test('stays closed when it was hidden last time', async ($, on) => {
    const { open } = stubEngine(on, { isHidden: true })
    await startSession($)
    await mountBand($, true)
    expect([...open]).toEqual([])
  })

  test('opens unasked once per session', async ($, on) => {
    const { open } = stubEngine(on)
    await startSession($)
    await mountBand($, true)
    open.delete(PANE)
    await mountBand($, true)
    expect([...open]).toEqual([])
  })

  test('toggles with no argument', async ($, on) => {
    const { open } = stubEngine(on)
    await startSession($)
    await mountBand($, true)
    expect((await runCommand($, '')).text).toContain('hidden')
    expect([...open]).toEqual([])
    expect((await runCommand($, '')).text).toContain('shown')
    expect([...open]).toEqual([PANE])
  })

  test('sets it with true or false', async ($, on) => {
    const { open } = stubEngine(on)
    await startSession($)
    await mountBand($, true)
    await runCommand($, 'false')
    await runCommand($, 'false')
    expect([...open]).toEqual([])
    await runCommand($, 'true')
    expect([...open]).toEqual([PANE])
  })

  test('rejects other arguments', async ($, on) => {
    const { open } = stubEngine(on)
    await startSession($)
    await mountBand($, true)
    expect((await runCommand($, 'maybe')).text).toBe('Usage: /mods-pane [true|false]')
    expect([...open]).toEqual([PANE])
  })
})

describe('drawing', () => {
  const surfaces = ['terminal', 'desktop'] as const

  for (const surface of surfaces) {
    test(`pane shows each mod's state on ${surface}`, { plugins: PUBLISHERS }, async ($, on) => {
      const { clock } = stubEngine(on)
      await clock.set(10_000)
      await startSession($)
      const ui = await $.ui.mount({
        plugin: 'mods-pane',
        surface,
        component: 'Pane',
        requestId: PANE,
        props: { bodyColumns: 80 } as never,
      })
      expect(await ui.find({ text: /block-secrets.*1 call blocked/ })).toBeDefined()
      expect(await ui.find({ text: /Bash call prints a GitHub token/ })).toBeDefined()
      expect(await ui.find({ text: /commit-lint.*1 commit blocked/ })).toBeDefined()
      expect(await ui.find({ text: /sync-drift.*2 changed/ })).toBeDefined()
      expect(await ui.find({ text: /agent-links.*waiting on brain-55/ })).toBeDefined()
      expect(await ui.find({ text: /brain-55 · ~\/repos\/brain · awaiting their reply · busy/ })).toBeDefined()
      const headers = await ui.findAll({ type: 'Text', text: /^[●○] / })
      expect(headers.map(header => header.text.split(' ')[1])).toEqual([
        'sync-drift',
        'block-secrets',
        'commit-lint',
        'agent-links',
      ])
      expect(await ui.findAll({ type: 'Text', text: /^─{80}$/ })).toHaveLength(3)
    })

    test(`pane wraps long lines instead of truncating on ${surface}`, { plugins: PUBLISHERS }, async ($, on) => {
      stubEngine(on)
      await startSession($)
      const ui = await $.ui.mount({
        plugin: 'mods-pane',
        surface,
        component: 'Pane',
        requestId: PANE,
        props: { bodyColumns: 24 } as never,
      })
      const texts = await ui.findAll({ type: 'Text' })
      expect(texts.length).toBeGreaterThan(0)
      for (const text of texts) expect(String(text.props.wrap ?? 'wrap')).not.toMatch(/truncate|end|middle/)
    })

    test(`docked pane keeps Hide at its bottom right on ${surface}`, async ($, on) => {
      stubEngine(on)
      await startSession($)
      const ui = await $.ui.mount({
        plugin: 'mods-pane',
        surface,
        component: 'Pane',
        requestId: PANE,
        props: { bodyColumns: 40, placement: 'dock', scroll: { bodyRows: 30 } } as never,
      })
      const [root] = await ui.findAll({ type: 'Box' })
      expect(root?.props.minHeight).toBe(30)
      const row = root?.children.at(-1) as { props: Record<string, unknown> } | undefined
      expect(row?.props.justifyContent).toBe('flex-end')
      expect(await ui.find({ key: 'hide' })).toBeDefined()
    })

    test(`band counts events since the pane was hidden on ${surface}`, { plugins: PUBLISHERS }, async ($, on) => {
      const { clock } = stubEngine(on)
      await clock.set(6_500)
      await startSession($)
      await runCommand($, 'false')
      const band = await $.ui.mount({
        plugin: 'mods-pane',
        surface,
        component: 'AbovePrompt',
        props: { bodyColumns: 80, hasSurvey: false } as never,
      })
      expect(await band.find({ text: /mods pane hidden/ })).toBeDefined()
      expect(await band.find({ text: /1 new event\b/ })).toBeDefined()
    })
  }

  test('band shows drift while the pane is shown', { plugins: PUBLISHERS }, async ($, on) => {
    stubEngine(on)
    await startSession($)
    const band = await $.ui.mount({
      plugin: 'mods-pane',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { bodyColumns: 80, hasSurvey: false } as never,
    })
    expect(await band.find({ text: /~\/\.claude drift: 2 changed/ })).toBeDefined()
    expect(await band.find({ text: /mods pane hidden/ })).toBeUndefined()
  })

  test('band stays empty while the pane is shown and nothing drifted', async ($, on) => {
    stubEngine(on)
    await startSession($)
    const band = await $.ui.mount({
      plugin: 'mods-pane',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { bodyColumns: 80, hasSurvey: false } as never,
    })
    expect(await band.find({ text: /mods pane hidden/ })).toBeUndefined()
  })
})

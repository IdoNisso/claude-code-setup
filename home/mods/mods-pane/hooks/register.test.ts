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

  test('sets it with show or hide', async ($, on) => {
    const { open } = stubEngine(on)
    await startSession($)
    await mountBand($, true)
    await runCommand($, 'hide')
    await runCommand($, 'hide')
    expect([...open]).toEqual([])
    await runCommand($, 'show')
    expect([...open]).toEqual([PANE])
  })

  test('answers other arguments with usage', async ($, on) => {
    const { open } = stubEngine(on)
    await startSession($)
    await mountBand($, true)
    for (const arg of ['maybe', 'true']) {
      const { text } = await runCommand($, arg)
      expect(text).toStartWith(`Unknown argument "${arg}".`)
      expect(text).toContain('/mods-pane remove <mod>')
    }
    expect((await runCommand($, 'help')).text).toStartWith('Usage: /mods-pane')
    expect([...open]).toEqual([PANE])
  })
})

const mountPane = ($: Engine) =>
  $.ui.mount({
    plugin: 'mods-pane',
    surface: 'terminal',
    component: 'Pane',
    requestId: PANE,
    props: { bodyColumns: 80 } as never,
  })

const headers = async ($: Engine) => {
  const pane = await mountPane($)
  const found = await pane.findAll({ type: 'Text', text: /^[●○] / })
  await pane.unmount()
  return found.map(header => header.text.split(' ')[1])
}

describe('customizing', () => {
  test('removes and adds sections by name or half a name', { plugins: PUBLISHERS }, async ($, on) => {
    stubEngine(on)
    await startSession($)
    expect((await runCommand($, 'remove secrets agent-links')).text).toBe('Removed block-secrets, agent-links.')
    expect(await headers($)).toEqual(['sync-drift', 'commit-lint'])
    await runCommand($, 'add links')
    expect(await headers($)).toEqual(['sync-drift', 'commit-lint', 'agent-links'])
  })

  test('names the mods it does not know', async ($, on) => {
    stubEngine(on)
    await startSession($)
    expect((await runCommand($, 'remove secrets nope')).text).toStartWith('Unknown mod: nope.')
    expect((await runCommand($, 'remove')).text).toStartWith('Name at least one mod.')
    expect((await runCommand($, 'list')).text).not.toContain('removed')
  })

  test('says so when every section is removed', { plugins: PUBLISHERS }, async ($, on) => {
    stubEngine(on)
    await startSession($)
    await runCommand($, 'remove drift secrets commit links')
    expect(await (await mountPane($)).find({ text: /Every mod is removed/ })).toBeDefined()
  })

  test('puts the named mods first and restores the default', { plugins: PUBLISHERS }, async ($, on) => {
    stubEngine(on)
    await startSession($)
    expect((await runCommand($, 'order agent-links commit')).text).toBe(
      'Order: agent-links, commit-lint, sync-drift, block-secrets.',
    )
    expect(await headers($)).toEqual(['agent-links', 'commit-lint', 'sync-drift', 'block-secrets'])
    await runCommand($, 'order')
    expect(await headers($)).toEqual(['sync-drift', 'block-secrets', 'commit-lint', 'agent-links'])
  })

  test('limits the entries per section', { plugins: PUBLISHERS }, async ($, on) => {
    stubEngine(on)
    await startSession($)
    expect((await runCommand($, 'recent 0')).text).toStartWith('Give a whole number from 1 to 20')
    expect((await runCommand($, 'recent 1')).text).toBe('Showing up to 1 entry per section.')
    expect((await runCommand($, 'recent')).text).toStartWith('Showing up to 1 entry per section.')
  })

  const MANY_BLOCKS = publisher('block-secrets', on => {
    on('session.start', async ($, e, next) => {
      const blocks = [1, 2, 3, 4, 5, 6].map(n => ({ tool: 'Bash', reason: `reason ${n}`, at: n * 1_000 }))
      await $.state.set({ plugin: 'block-secrets', key: 'blocks' }, blocks)
      return next(e)
    })
  })

  test('redraws the open pane with the new limit', { plugins: [MANY_BLOCKS] }, async ($, on) => {
    stubEngine(on)
    await startSession($)
    const pane = await mountPane($)
    const shown = async () => (await pane.findAll({ type: 'Text', text: /call reason \d$/ })).map(text => text.text.replace('Bash call ', ''))
    expect(await shown()).toEqual(['reason 6', 'reason 5', 'reason 4'])
    await runCommand($, 'recent 5')
    expect(await shown()).toEqual(['reason 6', 'reason 5', 'reason 4', 'reason 3', 'reason 2'])
    await runCommand($, 'recent 1')
    expect(await shown()).toEqual(['reason 6'])
  })

  test('keeps its settings for the next session', { plugins: PUBLISHERS }, async ($, on) => {
    stubEngine(on)
    await startSession($)
    await runCommand($, 'remove secrets')
    await runCommand($, 'order links')
    await runCommand($, 'recent 2')
    await startSession($)
    expect(await headers($)).toEqual(['agent-links', 'sync-drift', 'commit-lint'])
    expect((await runCommand($, 'list')).text).toContain('2 entries per section')
  })

  test('restores its settings from the last session', { plugins: PUBLISHERS }, async ($, on) => {
    stubEngine(on, { removed: ['commit-lint', 'gone-mod'], order: ['agent-links', 'gone-mod'], recent: 99 })
    await startSession($)
    expect(await headers($)).toEqual(['agent-links', 'sync-drift', 'block-secrets'])
    expect((await runCommand($, 'list')).text).toContain('3 entries per section')
  })

  test('lists every mod with its status', { plugins: PUBLISHERS }, async ($, on) => {
    stubEngine(on)
    await startSession($)
    await runCommand($, 'remove commit')
    const lines = ((await runCommand($, 'list')).text ?? '').split('\n')
    expect(lines[0]).toBe('Mods pane hidden, 3 entries per section')
    expect(lines.slice(1)).toEqual([
      expect.stringMatching(/^● sync-drift +shown +2 changed$/),
      expect.stringMatching(/^● block-secrets +shown +1 call blocked$/),
      expect.stringMatching(/^● commit-lint +removed +1 commit blocked$/),
      expect.stringMatching(/^● agent-links +shown +waiting on brain-55$/),
    ])
  })

  test('asks the named mods, or all, to reset', async ($, on) => {
    stubEngine(on)
    const requests: unknown[] = []
    on('state.set', { plugin: 'mods-pane', key: 'resetRequest' }, (_$, e, next) => {
      requests.push(e.value)
      return next(e)
    })
    await startSession($)
    expect((await runCommand($, 'reset secrets')).text).toBe('Asked block-secrets to reset.')
    await runCommand($, 'reset all')
    expect((await runCommand($, 'reset')).text).toStartWith('Name a mod or "all".')
    expect(requests).toEqual([
      { mods: ['block-secrets'], at: expect.any(Number) },
      { mods: ['sync-drift', 'block-secrets', 'commit-lint', 'agent-links'], at: expect.any(Number) },
    ])
  })
})

describe('dismissing', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`a link's button asks agent-links to dismiss it on ${surface}`, { plugins: PUBLISHERS }, async ($, on) => {
      stubEngine(on)
      const requests: unknown[] = []
      on('state.set', { plugin: 'mods-pane', key: 'dismissRequest' }, (_$, e, next) => {
        requests.push(e.value)
        return next(e)
      })
      await startSession($)
      const ui = await $.ui.mount({
        plugin: 'mods-pane',
        surface,
        component: 'Pane',
        requestId: PANE,
        props: { bodyColumns: 80 } as never,
      })
      expect(await ui.find({ key: 'dismiss:block-secrets:Bash' })).toBeUndefined()
      await ui.press({ key: 'dismiss:agent-links:brain-55' } as never)
      expect(requests).toEqual([{ mod: 'agent-links', entry: 'brain-55', at: expect.any(Number) }])
    })
  }
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
      await runCommand($, 'hide')
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

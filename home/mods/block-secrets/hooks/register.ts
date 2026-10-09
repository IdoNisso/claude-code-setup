import { atom, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ResetRequest } from '../../mods-pane/types'
import type { SecretBlock } from '../types'

type Rule = { pattern: RegExp; reason: string }

const PATH_RULES: Rule[] = [
  { pattern: /(^|[^A-Za-z0-9_])\.env/, reason: 'references a .env file' },
  {
    pattern: /\.ssh\/|\.aws\/|\.config\/gh\/|\.netrc|\.credentials\.json/,
    reason: 'references a credentials path',
  },
]

const COMMAND_RULES: Rule[] = [
  ...PATH_RULES,
  { pattern: /gh\s+auth\s+token/, reason: 'prints a GitHub token' },
  {
    pattern: /(echo|printf)[^|;&]*\$\{?[A-Za-z0-9_]*(TOKEN|SECRET|KEY|PASSWORD|PASSWD|CREDENTIAL|AUTH)/,
    reason: 'prints a secret-looking variable',
  },
]

const MAX_BLOCKS = 50

const blocks = atom({ plugin: 'block-secrets', key: 'blocks' } as const, [])

const FILE_TOOLS = ['Read', 'Edit', 'Write', 'NotebookEdit'] as const

const findViolation = (text: string, rules: Rule[]) =>
  rules.find(rule => rule.pattern.test(text))?.reason

const block = async ($: EngineInterface, tool: string, reason: string) => {
  $.ui.toast(`block-secrets: blocked ${tool} call that ${reason}`)
  const entry: SecretBlock = { tool, reason, at: await $.clock.now() }
  await update($, blocks, list => [...list, entry].slice(-MAX_BLOCKS)).catch(() => {})
  return {
    deny: `Blocked by block-secrets: ${tool} call ${reason}. If this is needed, ask the user to run it themselves.`,
  }
}

const GUARD_FAILED = { deny: 'block-secrets: its guard failed.' }

const isResetFor = (request: ResetRequest | null) => request?.mods.includes('block-secrets') === true

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    const reason = findViolation(e.command, COMMAND_RULES)
    return reason ? block($, 'Bash', reason) : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : GUARD_FAILED))

  on('tool.call', { tool: FILE_TOOLS }, ($, e, next) => {
    const path =
      e.tool === 'NotebookEdit' ? e.notebook_path
      : e.tool === 'Read' || e.tool === 'Edit' || e.tool === 'Write' ? e.file_path
      : ''
    const reason = findViolation(path, PATH_RULES)
    return reason ? block($, e.tool, reason) : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : GUARD_FAILED))

  on('state.set', { plugin: 'mods-pane', key: 'resetRequest' }, async ($, e, next) => {
    const set = await next(e)
    if (isResetFor(e.value)) await update($, blocks, () => []).catch(() => {})
    return set
  }).catch(($, e, next) => (next.called ? undefined : next(e)))
}

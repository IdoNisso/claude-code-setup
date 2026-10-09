import type { EngineInterface, Register } from 'claude-code'

const TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'chore', 'perf']
const MAX_SUBJECT_LENGTH = 50

const GIT_COMMIT = /\bgit(?:\s+-[Cc]\s+\S+|\s+--?[\w-]+(?:=\S+)?)*\s+commit\b/
const HEREDOC = /<<-?\s*['"]?(\w+)['"]?\n([\s\S]*?)\n\s*\1\b/
const MESSAGE_FLAG = /\s(?:-[a-zA-Z]*m|--message)(?:=|\s*)(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^\s'"]\S*))/
const HEADER = new RegExp(`^(${TYPES.join('|')})(\\([\\w./-]+\\))?!?: (.+)$`)

const NOT_PAST_OR_GERUND = new Set(['embed', 'feed', 'need', 'seed', 'shed', 'speed', 'bring', 'ping', 'string'])

const commitSubject = (command: string): string | undefined => {
  const commit = GIT_COMMIT.exec(command)
  if (!commit) return undefined
  const rest = command.slice(commit.index + commit[0].length)
  const heredoc = HEREDOC.exec(rest)
  const flag = MESSAGE_FLAG.exec(rest)
  const message = heredoc?.[2] ?? flag?.[1]?.replace(/\\(.)/g, '$1') ?? flag?.[2] ?? flag?.[3]
  return message
    ?.split('\n')
    .map(line => line.trim())
    .find(line => line !== '')
}

const subjectProblems = (subject: string): string[] => {
  const header = HEADER.exec(subject)
  if (!header) {
    return [`must start with "<type>[(<scope>)]: " where type is one of ${TYPES.join('|')}`]
  }
  const problems: string[] = []
  const description = header[3] ?? ''
  if (subject.length > MAX_SUBJECT_LENGTH) {
    problems.push(`is ${subject.length} characters, max ${MAX_SUBJECT_LENGTH}`)
  }
  if (description.endsWith('.')) problems.push('ends with a period')
  const firstWord = (description.split(/\s/)[0] ?? '').toLowerCase()
  if (/^[a-z]+(ed|ing)$/.test(firstWord) && !NOT_PAST_OR_GERUND.has(firstWord)) {
    problems.push(`starts with "${firstWord}", use the imperative mood ("add" not "added")`)
  }
  return problems
}

const block = ($: EngineInterface, subject: string, problems: string[]) => {
  $.ui.toast(`commit-lint: blocked commit "${subject}"`)
  return {
    deny: `Blocked by commit-lint: the subject "${subject}" ${problems.join('; ')}. Rewrite the subject and commit again.`,
  }
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    const subject = commitSubject(e.command)
    if (subject === undefined) return next(e)
    const problems = subjectProblems(subject)
    return problems.length > 0 ? block($, subject, problems) : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'commit-lint: its guard failed.' }))
}
